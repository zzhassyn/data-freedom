"""STT reads stay read-only and polling never downloads finished transcripts."""
from types import SimpleNamespace
import sqlite3

import pytest

from app.conversations import import_records
from app.db import Database
from app.stt.service import TranscriptionQueue


@pytest.fixture
def stt_rows(tmp_path):
    database = Database(tmp_path / 'stt-read-paths.sqlite')
    ids = ['queued', 'running', 'done', 'failed', 'stale', 'other-group']
    records = [{'conversation_id': cid, 'channel': 'voice call', 'language': 'RU',
                'audio_url': f'https://media.dynamics.com/{cid}.mp3',
                'transcript': [{'timestamp': '2026-11-03T18:10:00+05:00', 'speaker': 'client',
                                'text': 'Где найти отчёт?'}]} for cid in ids]
    import_records(database, records[:-1], 'A')
    import_records(database, records[-1:], 'B')
    settings = SimpleNamespace(stt_enabled=True, stt_keep_raw=False, worker_mode='worker',
                               openrouter_api_key='fixture-no-network', stt_model='fixture')
    queue = TranscriptionQueue(database, settings)
    queue.store.enqueue(ids, 'fixture')
    queue.store.update('running', 1, status='running', step='transcribe')
    queue.store.update('done', 1, status='done', step='done',
                       turns=[{'text': 'finished transcript ' * 1000}], speakers=[{'id': 'speaker'}])
    queue.store.update('failed', 1, status='failed', step='failed')
    changed = database.get_conversation('stale')
    changed['transcriptHash'] = 'new-transcript-hash'
    database.save_conversation(changed)
    return database, queue


@pytest.fixture
def sql_calls(monkeypatch, stt_rows):
    calls = []
    connect = sqlite3.connect

    def recorded_connect(*args, **kwargs):
        connection = connect(*args, **kwargs)
        connection.set_trace_callback(calls.append)
        return connection

    monkeypatch.setattr(sqlite3, 'connect', recorded_connect)
    return calls


def test_stt_get_and_filtered_all_are_single_read_queries(stt_rows, sql_calls):
    _, queue = stt_rows
    assert queue.store.get('done')['turns']
    assert len(sql_calls) == 1 and sql_calls[0].startswith('SELECT ')
    sql_calls.clear()
    rows = queue.store.all('A', statuses=('queued',))
    assert [row['conversation_id'] for row in rows] == ['queued']
    assert len(sql_calls) == 1
    assert "t.status IN ('queued')" in sql_calls[0]
    assert 'c.group_id=' in sql_calls[0]


def test_stt_metadata_read_omits_finished_transcript_payload(stt_rows, sql_calls):
    _, queue = stt_rows
    rows = queue.store.all('A', include_content=False)
    assert {row['conversation_id'] for row in rows} == {'queued', 'running', 'done', 'failed'}
    assert all(row['turns'] == [] and row['speakers'] == [] for row in rows)
    assert len(sql_calls) == 1
    assert 't.turns_json' not in sql_calls[0] and 't.speakers_json' not in sql_calls[0]
    assert "'[]' AS turns_json" in sql_calls[0]


def test_stt_pending_poll_only_reads_queued_current_rows(stt_rows, sql_calls):
    _, queue = stt_rows
    queue.poll_pending()
    queue.poll_pending()
    assert queue.scheduled == {('queued', 1), ('other-group', 1)}
    assert queue.queue.qsize() == 2
    assert len(sql_calls) == 2
    assert all(sql.startswith('SELECT ') and "t.status IN ('queued')" in sql for sql in sql_calls)
    assert all('t.turns_json' not in sql and 't.speakers_json' not in sql for sql in sql_calls)


def test_stt_jobs_reuses_one_consistent_read_snapshot(stt_rows, sql_calls):
    _, queue = stt_rows
    result = queue.jobs('A')
    assert result['enabled'] is True
    assert result['total'] == 4
    assert {key: result[key] for key in ('done', 'failed', 'running', 'queued')} == {
        'done': 1, 'failed': 1, 'running': 1, 'queued': 1}
    assert {row['conversationId'] for row in result['items']} == {'queued', 'running', 'done', 'failed'}
    assert len(sql_calls) == 4
    assert sql_calls[0] == 'BEGIN' and sql_calls[-1] == 'COMMIT'
    assert all(sql.startswith('SELECT ') for sql in sql_calls[1:-1])
    assert 't.turns_json' not in sql_calls[1]


def test_stt_empty_and_disabled_jobs_skip_conversation_reads(stt_rows, sql_calls):
    _, queue = stt_rows
    assert queue.jobs('missing')['total'] == 0
    assert len(sql_calls) == 3  # BEGIN + one filtered SELECT + COMMIT.
    sql_calls.clear()
    queue.settings.stt_enabled = False
    result = queue.jobs()
    assert result['enabled'] is False and result['items'] == []
    assert sql_calls == []


def test_stt_status_filter_rejects_unknown_values_without_query(stt_rows, sql_calls):
    _, queue = stt_rows
    assert queue.store.all(statuses=[]) == []
    with pytest.raises(ValueError, match='Unknown transcription status'):
        queue.store.all(statuses=['unknown'])
    assert sql_calls == []

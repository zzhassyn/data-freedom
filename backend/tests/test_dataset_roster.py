"""Only complete dataset imports replace the durable organizer roster."""

from copy import deepcopy

import pytest

from app import conversations
from app.db import Database
from app.errors import ApiError


def record(conversation_id, text='Вопрос клиента'):
    return {
        'conversation_id': conversation_id,
        'channel': 'agent chat',
        'language': 'RU',
        'audio_url': None,
        'transcript': [{'timestamp': '00:00', 'speaker': 'client', 'text': text}],
    }


def full_payload(records, group='DEV'):
    return {'data': {'dataset_group_id': group, 'total_records': len(records), 'records': records}}


@pytest.fixture
def db(tmp_path):
    return Database(tmp_path / 'roster.sqlite')


def test_full_metadata_captures_order_and_hashes_then_replaces_roster(db, monkeypatch):
    monkeypatch.setattr(conversations, 'utcnow', lambda: '2026-11-07T01:00:00Z')
    conversations.import_records(db, full_payload([record('second'), record('first')]), 'DEV')
    before = db.get_setting('datasetRoster:DEV')
    assert before == {
        'ids': ['second', 'first'],
        'transcriptHashes': {cid: db.get_conversation(cid)['transcriptHash'] for cid in ['second', 'first']},
        'capturedAt': '2026-11-07T01:00:00Z',
    }

    monkeypatch.setattr(conversations, 'utcnow', lambda: '2026-11-07T02:00:00Z')
    conversations.import_records(db, full_payload([record('third'), record('second', 'Уточнённый вопрос')]), 'DEV')
    after = db.get_setting('datasetRoster:DEV')
    assert after['ids'] == ['third', 'second']
    assert after['transcriptHashes'] == {
        cid: db.get_conversation(cid)['transcriptHash'] for cid in ['third', 'second']
    }
    assert after['transcriptHashes']['second'] != before['transcriptHashes']['second']
    assert after['capturedAt'] == '2026-11-07T02:00:00Z'
    # Removing a member from the latest source roster does not delete registry history.
    assert db.get_conversation('first')['id'] == 'first'


@pytest.mark.parametrize('metadata', [
    None,
    {},
    {'dataset_group_id': 'DEV'},
    {'total_records': 1},
    {'dataset_group_id': 'OTHER', 'total_records': 1},
    {'dataset_group_id': 'DEV', 'total_records': 2},
    {'dataset_group_id': 'DEV', 'total_records': True},
    {'dataset_group_id': 'DEV', 'total_records': 1.0},
])
def test_partial_import_preserves_roster_even_when_member_changes(db, metadata):
    conversations.import_records(db, full_payload([record('original'), record('retained')]), 'DEV')
    roster = deepcopy(db.get_setting('datasetRoster:DEV'))
    records = [record('original', 'Изменённая реплика')]
    payload = records if metadata is None else {'data': {**metadata, 'records': records}}
    conversations.import_records(db, payload, 'DEV')
    assert db.get_setting('datasetRoster:DEV') == roster
    assert db.get_conversation('retained')['id'] == 'retained'
    assert db.get_conversation('original')['transcriptHash'] != roster['transcriptHashes']['original']


def test_upload_does_not_certify_original_dataset_metadata(db):
    conversations.import_records(db, full_payload([record('official')]), 'DEV')
    roster = db.get_setting('datasetRoster:DEV')
    conversations.import_records(db, full_payload([record('uploaded')]), 'UPLOAD')
    assert db.get_setting('datasetRoster:DEV') == roster
    assert db.get_setting('datasetRoster:UPLOAD') is None
    assert db.get_conversation('uploaded')['datasetGroupId'] == 'UPLOAD'


@pytest.mark.parametrize('authority', ['source', 'full_dataset'])
def test_authoritative_import_without_metadata_captures_roster(db, authority):
    payload = {'data': {'records': [record('from-api')]}}
    list(conversations.import_steps(db, payload, 'CONTROL', **{authority: True}))
    assert db.get_setting('datasetRoster:CONTROL')['ids'] == ['from-api']


@pytest.mark.parametrize('authority', ['source', 'full_dataset'])
@pytest.mark.parametrize('invalid_metadata', [
    {'dataset_group_id': 'OTHER'},
    {'total_records': 2},
    {'total_records': True},
    {'total_records': 1.0},
    {'total_records': None},
])
def test_authoritative_import_rejects_inconsistent_metadata_without_changes(db, authority, invalid_metadata):
    conversations.import_records(db, full_payload([record('original')]), 'DEV')
    before = db.get_setting('datasetRoster:DEV')
    payload = {'data': {'records': [record('unexpected')], **invalid_metadata}}
    with pytest.raises(ApiError) as exc:
        list(conversations.import_steps(db, payload, 'DEV', **{authority: True}))
    assert exc.value.code == 'invalid_transcript'
    assert db.get_setting('datasetRoster:DEV') == before
    assert [entry['id'] for entry in db.all_conversations()] == ['original']


def test_roster_failure_rolls_back_records_roster_and_sync_receipt(db, monkeypatch):
    conversations.import_records(db, full_payload([record('original')]), 'DEV')
    before_record = db.get_conversation('original')
    before_roster = db.get_setting('datasetRoster:DEV')
    db.set_setting('lastSyncAt', 'old-sync')
    db.set_setting('lastResult', {'imported': 1, 'updated': 0, 'unchanged': 0})
    original_set_setting = db.set_setting

    def fail_after_roster_write(key, value, conn=None):
        original_set_setting(key, value, conn)
        if key == 'datasetRoster:DEV':
            raise RuntimeError('Simulated failure after roster write')

    monkeypatch.setattr(db, 'set_setting', fail_after_roster_write)
    payload = full_payload([record('original', 'Изменение'), record('new')])
    with pytest.raises(RuntimeError, match='after roster write'):
        list(conversations.import_steps(db, payload, 'DEV', source=True))
    assert db.get_conversation('original') == before_record
    assert [entry['id'] for entry in db.all_conversations()] == ['original']
    assert db.get_setting('datasetRoster:DEV') == before_roster
    assert db.get_setting('lastSyncAt') == 'old-sync'
    assert db.get_setting('lastResult') == {'imported': 1, 'updated': 0, 'unchanged': 0}


def test_dataset_import_endpoint_marks_fetched_response_authoritative(client, monkeypatch):
    async def fetch_without_metadata(request, group_id):
        assert group_id == 'CONTROL'
        return {'data': {'records': [record('fetched')]}}

    async def no_background_work(request, result):
        pass

    monkeypatch.setattr(conversations, 'fetch_dataset', fetch_without_metadata)
    monkeypatch.setattr(conversations, 'schedule_import_work', no_background_work)
    response = client.post('/api/datasets/import', json={'groupId': 'CONTROL'})
    assert response.status_code == 200, response.text
    assert client.app.state.db.get_setting('datasetRoster:CONTROL')['ids'] == ['fetched']

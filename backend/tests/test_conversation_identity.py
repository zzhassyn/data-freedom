"""Registry identity remains shared across imports, filters and server restarts."""
from copy import deepcopy
import sqlite3

from fastapi.testclient import TestClient

from app import conversations
from app.db import Database, SCHEMA, json_dumps
from tests.helpers import create_app


def record(cid, language='RU', timestamp='00:03'):
    return {'conversation_id': cid, 'channel': 'voice call' if 'T' in timestamp else 'agent chat',
            'language': language, 'audio_url': None,
            'transcript': [{'timestamp': timestamp, 'speaker': 'client', 'text': 'Где найти отчёт?'}]}


def test_registry_and_detail_share_identity_independently_of_filters(client, monkeypatch):
    monkeypatch.setattr(conversations, 'utcnow', lambda: '2026-11-07T08:00:00.000Z')
    payload = [record('chat-ru'), record('chat-kz', 'KZ'),
               record('call', timestamp='2026-11-03T18:10:00.6388245+05:00')]
    payload[0].update(number=999, startedAt='2000-01-01T00:00:00Z')
    assert client.post('/api/conversations/upload', json=payload).status_code == 200
    rows = client.get('/api/conversations').json()['items']
    assert [row['number'] for row in rows] == [1, 2, 3]
    for row in rows:
        detail = client.get('/api/conversations/' + row['id']).json()
        filtered = client.get('/api/conversations', params={'q': row['id']}).json()['items'][0]
        assert (row['number'], row['startedAt']) == (detail['number'], detail['startedAt'])
        assert (row['number'], row['startedAt']) == (filtered['number'], filtered['startedAt'])
    assert rows[0]['startedAt'] == '2026-11-07T08:00:00.000Z'
    assert rows[2]['startedAt'] == '2026-11-03T13:10:00.638Z'
    assert client.get('/api/conversations', params={'language': 'KZ'}).json()['items'][0]['number'] == 2


def test_updated_records_keep_identity_after_import_and_restart(client, monkeypatch):
    monkeypatch.setattr(conversations, 'utcnow', lambda: '2026-11-07T08:00:00.000Z')
    payload = [record('first'), record('second')]
    client.post('/api/conversations/upload', json=payload)
    before = client.get('/api/conversations/first').json()
    monkeypatch.setattr(conversations, 'utcnow', lambda: '2026-11-07T09:00:00.000Z')
    changed = deepcopy(payload[0])
    changed['transcript'][0]['text'] = 'Где найти новый отчёт?'
    response = client.post('/api/conversations/upload', json=[record('third'), changed, payload[1]])
    assert response.json()['updated'] == 1
    after = client.get('/api/conversations/first').json()
    assert after['importedAt'] != before['importedAt']
    assert (after['number'], after['startedAt']) == (before['number'], before['startedAt'])
    assert client.get('/api/conversations/third').json()['number'] == 3
    with TestClient(create_app(client.app.state.settings)) as other_browser:
        assert other_browser.get('/api/conversations/first').json() == after
        assert [row['number'] for row in other_browser.get('/api/conversations').json()['items']] == [1, 2, 3]
        other_browser.post('/api/conversations/upload', json=[record('fourth')])
        assert other_browser.get('/api/conversations/fourth').json()['number'] == 4


def test_registry_cache_signature_changes_with_transcript_and_audio(client):
    payload = record('call', timestamp='2026-11-03T18:10:00+05:00')
    payload['audio_url'] = 'https://media.dynamics.com/first'
    client.post('/api/conversations/upload', json=[payload])
    before = client.get('/api/conversations').json()['items'][0]
    assert before['audioUrl'] == payload['audio_url']
    assert len(before['transcriptHash']) == 64
    payload['transcript'][0]['text'] += ' Нужен отчёт за октябрь.'
    assert client.post('/api/conversations/upload', json=[payload]).json()['updated'] == 1
    changed = client.get('/api/conversations').json()['items'][0]
    assert changed['transcriptHash'] != before['transcriptHash']
    assert changed['audioUrl'] == before['audioUrl']
    payload['audio_url'] = 'https://media.dynamics.com/renewed'
    assert client.post('/api/conversations/upload', json=[payload]).json()['updated'] == 0
    renewed = client.get('/api/conversations').json()['items'][0]
    assert renewed['transcriptHash'] == changed['transcriptHash']
    assert renewed['audioUrl'] == payload['audio_url'] != changed['audioUrl']


def test_legacy_database_identity_is_backfilled_and_survives_rowid_changes(tmp_path):
    path = tmp_path / 'legacy.sqlite'
    records = conversations.normalize_records([record('older'), record('later')], 'DEV')
    with sqlite3.connect(path) as conn:
        conn.executescript(SCHEMA)
        for rowid, body in zip((7, 11), records):
            conn.execute('INSERT INTO conversations (rowid,id,group_id,channel,language,audio_url,'
                         'transcript_json,transcript_hash,imported_at,body_json) VALUES(?,?,?,?,?,?,?,?,?,?)',
                         (rowid, body['id'], body['datasetGroupId'], body['channel'], body['language'],
                          body['audioUrl'], json_dumps(body['transcript']), body['transcriptHash'],
                          body['importedAt'], json_dumps(body)))
    database = Database(path)
    assert database.get_conversation('older')['number'] == 7
    assert database.get_conversation('later')['number'] == 11
    assert database.get_conversation('older')['startedAt'] == records[0]['importedAt']
    with sqlite3.connect(path) as conn:
        conn.execute("UPDATE conversations SET rowid=1 WHERE id='older'")
        conn.execute("UPDATE conversations SET rowid=2 WHERE id='later'")
    restarted = Database(path)
    assert restarted.get_conversation('older')['number'] == 7
    conversations.import_records(restarted, [record('new')], 'DEV')
    assert restarted.get_conversation('new')['number'] == 12

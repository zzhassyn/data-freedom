"""Bulk screen data keeps existing contracts without per-record SQL or AI work."""
from contextlib import contextmanager
from copy import deepcopy
from types import SimpleNamespace

import pytest

from app.evaluations import EvaluationQueue, zero_usage
from app.scoring import score_evaluation
from tests.helpers import example_items, use_runtime_providers


def saved_evaluation(db, conversation, *, evaluation_id='ev_1', model='provider/model'):
    checklist = db.get_checklist('active')
    items = example_items(checklist)
    for item in items:
        item['model'] = model
    result = {
        'id': evaluation_id, 'conversationId': conversation['id'],
        'checklistId': checklist['id'], 'checklistVersion': checklist['version'],
        'status': 'done', 'model': model, 'transcriptHash': conversation['transcriptHash'],
        'items': items, 'usage': zero_usage(), 'needsReviewCount': 0, 'originalTotal': None,
        '_judgeIdentity': 'openrouter:fixture-identity', '_conversation': deepcopy(conversation),
    }
    result.update(score_evaluation(checklist, items))
    db.save_evaluation(result)
    return result


def trace_reads(db, monkeypatch):
    original = db._connection
    queries, connections = [], []

    @contextmanager
    def read_only(*, write, snapshot):
        assert not write, 'A screen read attempted a write transaction'
        connections.append(snapshot)
        with original(write=write, snapshot=snapshot) as conn:
            conn.set_trace_callback(queries.append)
            yield conn

    monkeypatch.setattr(db, '_connection', read_only)
    return queries, connections


@pytest.mark.parametrize('size', [1, 65])
def test_bootstrap_matches_existing_routes_with_five_selects(client, dev_payload, monkeypatch, size):
    # Upload accepts the same organizer envelope as ordinary imports.
    payload = deepcopy(dev_payload)
    payload['data']['records'] = payload['data']['records'][:size]
    payload['data']['total_records'] = size
    assert client.post('/api/conversations/upload', json=payload).status_code == 200
    db = client.app.state.db
    for index, conversation in enumerate(db.all_conversations()):
        saved_evaluation(db, conversation, evaluation_id=f'ev_{index + 1}')
    registry = client.get('/api/conversations').json()
    details = {row['id']: client.get('/api/conversations/' + row['id']).json() for row in registry['items']}
    evaluations = {row['lastEvaluation']['id']: client.get('/api/evaluations/' + row['lastEvaluation']['id']).json()
                   for row in registry['items']}
    checklists = sorted(db.all_checklists(), key=lambda row: row['version'], reverse=True)
    queries, connections = trace_reads(db, monkeypatch)
    response = client.get('/api/bootstrap')
    assert response.status_code == 200, response.text
    body = response.json()
    assert body['schemaVersion'] == 1 and response.headers['cache-control'] == 'no-store'
    assert body['registry'] == registry
    assert {row['id']: row for row in body['conversations']} == details
    assert {row['id']: row for row in body['evaluations']} == evaluations
    assert body['checklists'] == checklists
    assert body['appeals'] == {'items': [], 'counts': {'open': 0, 'decided': 0}}
    assert connections == [True]
    assert len([sql for sql in queries if sql.startswith('SELECT')]) == 5
    assert all(sql.split()[0] in {'SELECT', 'BEGIN', 'COMMIT'} for sql in queries)


def test_bootstrap_preserves_historic_appeal_source_visibility_and_cache_identity(seeded_client, monkeypatch):
    import app.extras as extras

    db = seeded_client.app.state.db
    current = db.get_conversation('p1-ru-001')
    original = saved_evaluation(db, current)
    appeal = {'id': 'ap_1', 'evaluationId': original['id'], 'conversationId': current['id'],
              'criterionId': 'closing', 'status': 'open', 'createdAt': '2026-01-01T00:00:00Z',
              'decision': None, 'secondOpinion': {'answer': 'yes'}, '_secondOpinionIdentity': 'obsolete'}
    db.save_appeal(appeal)
    current['transcript'][0]['text'] = 'A changed transcript after the appealed evaluation.'
    current['transcriptHash'] = 'changed-source'
    db.save_conversation(current)
    latest = saved_evaluation(db, current, evaluation_id='ev_2')
    hidden = saved_evaluation(db, current, evaluation_id='ev_3', model='fake-provider')
    db.save_appeal({**appeal, 'id': 'ap_2', 'evaluationId': hidden['id']})
    use_runtime_providers(seeded_client.app.state.settings)
    monkeypatch.setattr(extras, '_provider_identity', lambda kind: 'current-identity')
    db.set_cache('summary', current['id'], {'sourceHash': extras._conversation_hash(current),
                 'providerIdentity': 'current-identity', 'result': {'operatorName': 'Current operator'}})
    stale = db.get_conversation('p1-ru-002')
    db.set_cache('summary', stale['id'], {'sourceHash': extras._conversation_hash(stale),
                 'providerIdentity': 'obsolete', 'result': {'operatorName': 'Old operator'}})
    source_stale = db.get_conversation('p1-ru-003')
    db.set_cache('summary', source_stale['id'], {'sourceHash': 'obsolete-source',
                 'providerIdentity': 'current-identity', 'result': {'operatorName': 'Old source'}})
    expected_appeal = seeded_client.get('/api/appeals/ap_1').json()
    expected_registry = seeded_client.get('/api/conversations').json()
    first = seeded_client.get('/api/bootstrap').json()
    assert first['registry'] == expected_registry
    assert [row['id'] for row in first['evaluations']] == [latest['id']]
    assert all(not key.startswith('_') for row in first['evaluations'] for key in row)
    assert first['appeals']['counts'] == {'open': 1, 'decided': 0}
    embedded = first['appeals']['items'][0]
    assert {key: embedded[key] for key in expected_appeal} == expected_appeal
    assert embedded['evaluation']['id'] == original['id']
    assert embedded['conversation']['transcript'] != current['transcript']
    assert embedded['conversation']['number'] == current['number']
    assert embedded['secondOpinion'] is None
    rows = {row['id']: row for row in first['registry']['items']}
    assert rows[current['id']]['summary'] == {'operatorName': 'Current operator'}
    assert rows[stale['id']]['summary'] is rows[source_stale['id']]['summary'] is None
    current['transcript'][0]['text'] = 'Another import must be visible on the next request.'
    current['transcriptHash'] = 'newer-source'
    db.save_conversation(current)
    second = seeded_client.get('/api/bootstrap').json()
    next_row = next(row for row in second['registry']['items'] if row['id'] == current['id'])
    assert next_row['summary'] is None and next_row['lastEvaluation']['status'] == 'stale'
    assert next(row for row in second['conversations'] if row['id'] == current['id'])['transcript'][0]['text'] == current['transcript'][0]['text']


def test_poll_and_active_job_reads_are_bounded_and_filter_terminal_evaluations(seeded_client, monkeypatch):
    db = seeded_client.app.state.db
    for index, conversation in enumerate(db.all_conversations()[:24]):
        evaluation = saved_evaluation(db, conversation, evaluation_id=f'ev_{index + 1}')
        if index < 2:
            evaluation['status'] = 'queued'
            db.save_evaluation(evaluation)
    db.save_job({'id': 'job_1', 'status': 'running', 'startedAt': '2026-01-01T00:00:00Z',
                 'items': [{'evaluationId': 'ev_1'}, {'evaluationId': 'ev_2'}]})
    queries, connections = trace_reads(db, monkeypatch)
    body = seeded_client.get('/api/jobs?status=active').json()
    assert len(body['items']) == 1 and body['items'][0]['checklistVersion'] == 1
    assert connections == [True]
    assert len([sql for sql in queries if sql.startswith('SELECT')]) == 2
    assert any("id IN (" in sql for sql in queries)
    queries.clear()
    connections.clear()
    queue = EvaluationQueue(db, SimpleNamespace(worker_mode='worker'))
    scheduled = []
    monkeypatch.setattr(queue, '_schedule', scheduled.append)
    queue.poll_pending()
    assert scheduled == ['ev_1', 'ev_2']
    assert queue._jobs_by_evaluation == {'ev_1': {'job_1'}, 'ev_2': {'job_1'}}
    assert connections == [True]
    assert len([sql for sql in queries if sql.startswith('SELECT')]) == 2
    assert any("status IN ('queued')" in sql for sql in queries)


def test_health_and_history_share_read_snapshots(seeded_client, monkeypatch):
    db = seeded_client.app.state.db
    conversation = db.get_conversation('p1-ru-001')
    evaluation = saved_evaluation(db, conversation)
    db.record_usage({'costUsd': 1.25, 'calls': 1}, latency_ms=100, kind='evaluation')
    queries, connections = trace_reads(db, monkeypatch)
    health = seeded_client.get('/api/health').json()
    assert health['totalCostUsd'] == 1.25 and health['avgCriterionMs'] == 100
    assert connections == [True]
    assert len([sql for sql in queries if sql.startswith('SELECT')]) == 2
    queries.clear()
    connections.clear()
    history = seeded_client.get('/api/conversations/p1-ru-001/evaluations').json()
    assert [row['id'] for row in history['items']] == [evaluation['id']]
    assert connections == [True]
    assert len([sql for sql in queries if sql.startswith('SELECT')]) == 2
    assert any("conversation_id='p1-ru-001'" in sql for sql in queries)

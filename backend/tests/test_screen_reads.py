"""Screen reads stay bounded as datasets grow and never open a write transaction."""
from contextlib import contextmanager
from copy import deepcopy
from types import SimpleNamespace

import pytest

from app.appeals import build_appeals_payload, list_appeals
from app.checklists import active_checklist, diff_checklists, get_checklist, list_checklists, seed_checklist
from app.db import Database, json_dumps
from app.extras import _provider_identity
from app.operators import operators
from app.scoring import score_evaluation
from app.stats import accuracy, stats
from tests.helpers import example_items


def _seed(db, size):
    seed_checklist(db)
    checklist = db.get_checklist('active')
    with db.transaction() as conn:
        for index in range(size):
            conversation = {
                'id': f'conversation-{index}', 'datasetGroupId': 'UPLOAD', 'channel': 'chat',
                'language': 'RU', 'audioUrl': None,
                'transcript': [{'speaker': 'operator', 'text': 'Здравствуйте', 'timestamp': '00:00'}],
                'transcriptHash': f'hash-{index}', 'importedAt': '2026-01-01T00:00:00Z',
            }
            db.save_conversation(conversation, conn)
            evaluation = {
                'id': f'ev_{index}', 'conversationId': conversation['id'], 'checklistId': checklist['id'],
                'status': 'done', 'model': 'test-provider', 'transcriptHash': conversation['transcriptHash'],
                'items': example_items(checklist),
            }
            evaluation.update(score_evaluation(checklist, evaluation['items']))
            db.save_evaluation(evaluation, conn)
            db.save_appeal({
                'id': f'ap_{index}', 'evaluationId': evaluation['id'], 'criterionId': 'closing',
                'createdAt': '2026-01-01T00:00:00Z', 'status': 'open', 'decision': None,
            }, conn)
            db.set_cache('summary', conversation['id'], {
                'sourceHash': conversation['transcriptHash'],
                'providerIdentity': _provider_identity('summary'), 'result': {'operatorName': 'Алина'},
            }, conn=conn)
            conn.execute('INSERT INTO gold(conversation_id,criterion_id,answer) VALUES(?,?,?)',
                         (conversation['id'], 'closing', json_dumps('no')))


@pytest.mark.parametrize('size', [1, 24])
def test_screen_queries_are_bounded_and_read_only(tmp_path, monkeypatch, size):
    db = Database(tmp_path / 'screen.sqlite')
    _seed(db, size)
    request = SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace(db=db)))
    connection = db._connection
    queries, connections = [], []

    @contextmanager
    def traced(*, write, snapshot):
        assert write is False, 'A read endpoint opened a write transaction'
        connections.append(snapshot)
        with connection(write=write, snapshot=snapshot) as conn:
            conn.set_trace_callback(queries.append)
            yield conn

    monkeypatch.setattr(db, '_connection', traced)
    cases = [
        (lambda: operators(request), 4, lambda body: body['items'][0]['conversations'] == size),
        (lambda: stats(request), 4, lambda body: body['evaluated'] == size),
        (lambda: accuracy(request), 4, lambda body: body['conversations'] == size),
        (lambda: list_appeals(request), 4, lambda body: body['counts'] == {'open': size, 'decided': 0}),
        (lambda: list_checklists(request), 2, lambda body: body['items'][0]['evaluationsCount'] == size),
        (lambda: diff_checklists('cl_1', 'cl_1', request), 2, lambda body: len(body['unchanged']) == 8),
        (lambda: active_checklist(request), 1, lambda body: body['id'] == 'cl_1'),
        (lambda: get_checklist('cl_1', request), 1, lambda body: body['id'] == 'cl_1'),
    ]
    for read, expected_selects, check in cases:
        queries.clear()
        connections.clear()
        assert check(read())
        assert len(connections) == 1
        assert len([sql for sql in queries if sql.startswith('SELECT')]) == expected_selects
        assert all(sql.split()[0] in {'SELECT', 'BEGIN', 'COMMIT'} for sql in queries)


def test_appeals_payload_preserves_filters_snapshot_and_numeric_order(monkeypatch):
    import app.appeals as module

    monkeypatch.setattr(module, 'is_evaluation_visible', lambda row: not row.get('hidden'))
    evaluations = [
        {'id': 'ev_1', 'checklistId': 'cl_1', 'conversationId': 'c_1',
         '_conversation': {'language': 'KZ', 'channel': 'call'}, 'items': [{'criterionId': 'closing'}]},
        {'id': 'ev_hidden', 'hidden': True},
    ]
    checklists = [{'id': 'cl_1', 'criteria': [{'id': 'closing', 'title': 'Завершение'}]}]
    conversations = [{'id': 'c_1', 'language': 'RU', 'channel': 'chat'}]
    appeals = [
        {'id': f'ap_{number}', 'evaluationId': 'ev_1', 'criterionId': 'closing', 'status': status,
         'createdAt': '2026-01-01T00:00:00Z', 'decision': decision}
        for number, status, decision in [(10, 'open', None), (2, 'open', None),
                                         (3, 'confirmed', {'decidedAt': '2026-01-02T00:00:00Z'}),
                                         (11, 'changed', {'decidedAt': '2026-01-02T00:00:00Z'})]
    ] + [{'id': 'ap_99', 'evaluationId': 'ev_hidden', 'status': 'open'}]
    before = deepcopy((appeals, evaluations, checklists, conversations))
    payload = build_appeals_payload(appeals, evaluations, checklists, conversations)
    assert payload['counts'] == {'open': 2, 'decided': 2}
    assert [row['id'] for row in payload['items']] == ['ap_2', 'ap_10', 'ap_11', 'ap_3']
    assert all(row['conversationLanguage'] == 'KZ' and row['channel'] == 'call'
               and row['criterionTitle'] == 'Завершение' for row in payload['items'])
    maps = [{row['id']: row for row in rows} for rows in (evaluations, checklists, conversations)]
    assert build_appeals_payload(appeals, *maps) == payload
    assert build_appeals_payload(appeals, *maps, status='open')['items'] == payload['items'][:2]
    assert build_appeals_payload(appeals, *maps, status='decided')['items'] == payload['items'][2:]
    assert (appeals, evaluations, checklists, conversations) == before

"""Read-only tool scope, provenance, deadlines and per-round billing."""
import asyncio
from copy import deepcopy
import json
from types import SimpleNamespace

import pytest

from app import llm_switch
from app import assistant_workspace as aw
from app.errors import ApiError, JudgeError
from app.models import Usage
from tests.helpers import evaluate

CID = 'p1-ru-001'
USAGE = Usage(input_tokens=20, output_tokens=10, cost_usd=.002, calls=1)


@pytest.fixture
def workspace_client(seeded_client):
    if not any(getattr(route, 'path', '') == '/api/assistant' for route in seeded_client.app.routes):
        seeded_client.app.include_router(aw.router)
    return seeded_client


def body(client, **changes):
    return {'message': 'Что нужно разобрать?', 'language': 'RU', 'history': [],
            'focus': {'filters': {'conversationIds': [CID]}}, **changes}


def step(answer='Обращения доступны для разбора.', **changes):
    return {'factAudit': {'unansweredQuestions': [], 'unsupportedDraftClaims': [], 'attributionCorrections': []},
            'answer': answer, 'toolCalls': [], 'sourceIds': [], 'actionIds': [], 'citations': [], **changes}


def tool(name, **changes):
    return {'name': name, 'useFocus': False, 'query': '', 'filters': [], 'conversationIds': [], 'criterionId': None,
            'topicId': None, 'resolutionStatus': 'all', 'limit': 10,
            'fromVersion': None, 'toVersion': None, **changes}


def install(monkeypatch, function):
    monkeypatch.setattr(llm_switch.get_ai(), 'assistant_workspace_round', function, raising=False)


def send_receipt(callback, usage=USAGE):
    callback({'stage': 'sending', 'model': 'test-model'})
    callback({'stage': 'finished', 'status': 'received', 'usage': usage, 'provider': 'test'})


def known_cost(client):
    with client.app.state.db.read_connection() as conn:
        return conn.execute("SELECT COALESCE(SUM(cost_usd),0) FROM model_calls WHERE kind='assistant'").fetchone()[0]


def test_workspace_uses_shared_metrics_and_server_navigation(workspace_client, monkeypatch):
    ev = evaluate(workspace_client)[0]
    async def provider(data, callback, on_delta=None):
        assert data['mode'] == 'workspace'
        assert data['facts']['overview']['scope']['total'] == 65
        assert data['focus']['filters']['conversationIds'] == [CID]
        assert data['facts']['overview']['overview']['avgScore'] == ev['total']
        assert data['scope']['checklistId'] == 'cl_1'
        send_receipt(callback)
        return {'value': step(sourceIds=[data['sources'][0]['id']], actionIds=[data['actions'][0]['id']]), 'usage': USAGE}
    install(monkeypatch, provider)
    result = workspace_client.post('/api/assistant', json=body(workspace_client))
    assert result.status_code == 200, result.text
    value = result.json()
    assert value['sources'][0]['type'] == 'analytics'
    assert value['actions'][0]['type'] == 'show_registry'
    assert value['actions'][0]['filters']['conversationIds'] == [CID]
    assert value['usage']['costUsd'] == .004 and not value['usageIncomplete']
    assert known_cost(workspace_client) == .004


def test_two_round_read_returns_exact_citation_and_source_hash(workspace_client, monkeypatch):
    calls = []
    async def provider(data, callback, on_delta=None):
        calls.append(data)
        send_receipt(callback)
        if data['round'] == 1:
            return {'value': step('', toolCalls=[tool('read_conversations', conversationIds=[CID])]), 'usage': USAGE}
        source = data['toolResults'][0]['result']['conversations'][0]
        turn = source['turns'][0]
        return {'value': step('Клиент обозначил свой вопрос.', sourceIds=[source['sourceId']],
            citations=[{'sourceId': source['sourceId'], 'turnIdx': turn['idx'], 'quote': turn['text']}],
            actionIds=[source['actionId']]), 'usage': USAGE}
    install(monkeypatch, provider)
    result = workspace_client.post('/api/assistant?stream=true', json=body(workspace_client))
    assert result.status_code == 200, result.text
    events = [json.loads(line) for line in result.text.splitlines()]
    assert [e['stage'] for e in events if e['type'] == 'progress'] == ['analyzing', 'reading', 'analyzing', 'checking']
    value = events[-1]['result']
    assert value['citations'][0]['conversationId'] == CID
    assert value['citations'][0]['transcriptHash'] == workspace_client.app.state.db.get_conversation(CID)['transcriptHash']
    assert value['actions'][0]['conversationId'] == CID
    assert value['usage']['calls'] == 3 and known_cost(workspace_client) == .006
    assert len(calls) == 3


def test_model_cannot_read_unknown_conversation(workspace_client, monkeypatch):
    calls = []
    async def provider(data, callback, on_delta=None):
        calls.append(data)
        send_receipt(callback)
        return {'value': step('', toolCalls=[tool('read_conversations', conversationIds=['unknown-conversation'])]), 'usage': USAGE}
    install(monkeypatch, provider)
    result = workspace_client.post('/api/assistant', json=body(workspace_client))
    assert result.status_code == 400 and result.json()['error']['code'] == 'assistant_scope'
    assert len(calls) == 1 and known_cost(workspace_client) == .002


def test_search_filters_intersect_scope_and_never_widen_it(workspace_client, monkeypatch):
    evaluate(workspace_client, [CID, 'p1-ru-007'])
    async def provider(data, callback, on_delta=None):
        send_receipt(callback)
        if data['round'] == 1:
            return {'value': step('', toolCalls=[tool('search_conversations', useFocus=True,
                filters=[{'field': 'scoreFrom', 'value': '0'}, {'field': 'scoreTo', 'value': '100'}])]), 'usage': USAGE}
        result = data['toolResults'][0]['result']
        assert result['count'] == 1
        assert [row['conversationId'] for row in result['rows']] == [CID]
        return {'value': step(actionIds=[result['actionId']], sourceIds=[result['sourceId']]), 'usage': USAGE}
    install(monkeypatch, provider)
    result = workspace_client.post('/api/assistant', json=body(workspace_client))
    assert result.status_code == 200, result.text
    assert result.json()['actions'][0]['filters']['conversationIds'] == [CID]


@pytest.mark.parametrize('mutation', [
    {'sourceIds': ['invented']}, {'actionIds': ['https://attacker.invalid']},
    {'answer': '<img src=x onerror=alert(1)>'}, {'answer': '```unsafe```'},
    {'citations': [{'sourceId': 's1', 'turnIdx': 0, 'quote': 'invented'}]},
])
def test_untrusted_final_references_and_markup_rejected_after_accounting(workspace_client, monkeypatch, mutation):
    async def provider(data, callback, on_delta=None):
        send_receipt(callback)
        return {'value': step(**mutation), 'usage': USAGE}
    install(monkeypatch, provider)
    result = workspace_client.post('/api/assistant', json=body(workspace_client))
    assert result.status_code == 502, result.text
    assert known_cost(workspace_client) == .002


def test_selected_historical_context_does_not_use_current_transcript(workspace_client, monkeypatch):
    ev = evaluate(workspace_client)[0]
    db = workspace_client.app.state.db
    original = db.get_conversation(CID)
    changed = deepcopy(original)
    changed['transcriptHash'] = 'new-source'
    changed['transcript'][0]['text'] = 'Different text now'
    db.save_conversation(changed)
    async def provider(data, callback, on_delta=None):
        assert data['mode'] == 'workspace'
        conv = data['facts']['selectedConversation']
        assert conv['turns'][0]['text'] == original['transcript'][0]['text']
        assert conv['assessment']['evaluation']['id'] == ev['id']
        assert data['facts']['overview']['scope']['total'] == 65
        send_receipt(callback)
        return {'value': step(citations=[{'sourceId': conv['sourceId'], 'turnIdx': conv['turns'][0]['idx'],
                                         'quote': conv['turns'][0]['text']}]), 'usage': USAGE}
    install(monkeypatch, provider)
    response = workspace_client.post('/api/assistant', json=body(workspace_client,
        focus={'conversation': {'conversationId': CID, 'evaluationId': ev['id'], 'transcriptHash': original['transcriptHash']}}))
    assert response.status_code == 200, response.text
    assert response.json()['citations'][0]['transcriptHash'] == original['transcriptHash']


def test_repeated_referenced_change_returns_recoverable_error_after_one_refresh(workspace_client, monkeypatch):
    original = workspace_client.app.state.db.get_conversation(CID)
    async def provider(data, callback, on_delta=None):
        send_receipt(callback)
        source = data['facts']['selectedConversation']
        changed = workspace_client.app.state.db.get_conversation(CID)
        changed['transcript'][0]['text'] += ' changed'
        changed['transcriptHash'] = 'changed'
        workspace_client.app.state.db.save_conversation(changed)
        return {'value': step(sourceIds=[source['sourceId']]), 'usage': USAGE}
    install(monkeypatch, provider)
    response = workspace_client.post('/api/assistant', json=body(workspace_client, focus={'conversation': {
        'conversationId': CID, 'transcriptHash': original['transcriptHash']}}))
    assert response.status_code == 409, response.text
    assert response.json()['error']['code'] == 'assistant_source_changed'
    assert 'заново' not in response.json()['error']['message']
    assert known_cost(workspace_client) == .004


def test_workspace_does_not_pair_stale_marks_with_current_transcript(workspace_client, monkeypatch):
    evaluate(workspace_client)
    db = workspace_client.app.state.db
    changed = db.get_conversation(CID)
    changed['transcriptHash'] = 'current-hash'
    changed['transcript'][0]['text'] = 'Current wording'
    db.save_conversation(changed)
    async def provider(data, callback, on_delta=None):
        send_receipt(callback)
        if data['round'] == 1:
            return {'value': step('', toolCalls=[tool('read_conversations', conversationIds=[CID])]), 'usage': USAGE}
        source = data['toolResults'][0]['result']['conversations'][0]
        assert source['assessment'] is None
        assert source['assessmentUnavailableReason'] == 'stale_transcript'
        assert source['turns'][0]['text'] == 'Current wording'
        return {'value': step(citations=[{'sourceId': source['sourceId'], 'turnIdx': source['turns'][0]['idx'],
                                         'quote': source['turns'][0]['text']}]), 'usage': USAGE}
    install(monkeypatch, provider)
    response = workspace_client.post('/api/assistant', json=body(workspace_client))
    assert response.status_code == 200, response.text
    citation = response.json()['citations'][0]
    assert citation['evaluationId'] is None and citation['transcriptHash'] == 'current-hash'


def test_unknown_bill_is_durable_not_known_zero(workspace_client, monkeypatch):
    async def provider(data, callback, on_delta=None):
        send_receipt(callback, None)
        return {'value': step(), 'usage': None}
    install(monkeypatch, provider)
    response = workspace_client.post('/api/assistant', json=body(workspace_client))
    assert response.status_code == 200, response.text
    assert response.json()['usageIncomplete'] is True
    assert response.json()['usage']['calls'] == 2
    assert aw.assistant_usage_incomplete(workspace_client.app.state.db)
    assert known_cost(workspace_client) == 0
    receipts = workspace_client.app.state.db.get_caches('assistant_attempt')
    assert len(receipts) == 2 and all(not r['body']['usageKnown'] for r in receipts.values())


def test_later_round_failure_retains_prior_and_current_bills(workspace_client, monkeypatch):
    async def provider(data, callback, on_delta=None):
        send_receipt(callback)
        if data['round'] == 1:
            return {'value': step('', toolCalls=[tool('quality_overview')]), 'usage': USAGE}
        raise JudgeError('controlled failure')
    install(monkeypatch, provider)
    response = workspace_client.post('/api/assistant', json=body(workspace_client))
    assert response.status_code == 502
    assert known_cost(workspace_client) == .004


def test_round_limit_is_three_without_automatic_retry(workspace_client, monkeypatch):
    rounds = []
    async def provider(data, callback, on_delta=None):
        rounds.append(data['round'])
        send_receipt(callback)
        if data['phase'] == 'draft':
            return {'value': step(), 'usage': USAGE}
        return {'value': step('', toolCalls=[tool('quality_overview')]), 'usage': USAGE}
    install(monkeypatch, provider)
    response = workspace_client.post('/api/assistant', json=body(workspace_client))
    assert response.status_code == 502 and response.json()['error']['code'] == 'assistant_limit'
    assert rounds == [1, 2, 3] and known_cost(workspace_client) == .006


def test_duplicate_receipt_callback_does_not_charge_twice(workspace_client):
    ledger = aw.AttemptLedger(workspace_client.app.state.db)
    callback = ledger.callback(1)
    send_receipt(callback)
    callback({'stage': 'finished', 'status': 'received', 'usage': USAGE})
    assert known_cost(workspace_client) == .002


@pytest.mark.parametrize('sent', [False, True])
def test_cancel_before_or_after_dispatch_preserves_truth(workspace_client, monkeypatch, sent):
    async def scenario():
        workspace = aw.Workspace(workspace_client.app, aw.WorkspaceRequest.model_validate(body(workspace_client)))
        started = asyncio.Event()
        async def provider(data, callback, on_delta=None):
            if sent:
                callback({'stage': 'sending', 'model': 'test'})
            started.set()
            try:
                await asyncio.Event().wait()
            finally:
                if sent:
                    callback({'stage': 'finished', 'status': 'interrupted', 'usage': None})
        class Queue:
            async def call_model(self, fn, *args, **kwargs):
                return await fn(*args)
        original_queue = workspace.app.state.queue
        workspace.app.state.queue = Queue()
        install(monkeypatch, provider)
        async def emit(event):
            pass
        try:
            task = asyncio.create_task(aw.answer_workspace(workspace, emit))
            await started.wait()
            task.cancel()
            with pytest.raises(asyncio.CancelledError):
                await task
        finally:
            workspace.app.state.queue = original_queue
        receipts = workspace.app.state.db.get_caches('assistant_attempt')
        assert len(receipts) == int(sent)
        assert workspace.ledger.public_usage()['usageIncomplete'] is sent
    asyncio.run(scenario())


def test_whole_loop_deadline_stops_after_sent_unknown(workspace_client, monkeypatch):
    async def provider(data, callback, on_delta=None):
        callback({'stage': 'sending', 'model': 'test'})
        try:
            await asyncio.sleep(10)
        finally:
            callback({'stage': 'finished', 'status': 'interrupted', 'usage': None})
    install(monkeypatch, provider)
    monkeypatch.setattr(aw, 'TOTAL_TIMEOUT', .03)
    response = workspace_client.post('/api/assistant', json=body(workspace_client))
    assert response.status_code == 504
    assert response.json()['error']['code'] == 'assistant_timeout'
    assert aw.assistant_usage_incomplete(workspace_client.app.state.db)


def test_history_is_bounded_and_is_not_a_source(workspace_client, monkeypatch):
    async def provider(data, callback, on_delta=None):
        assert sum(len(row['content']) for row in data['history']) <= 20000
        assert all(row['role'] in ('user', 'assistant') for row in data['history'])
        send_receipt(callback)
        return {'value': step(sourceIds=['history']), 'usage': USAGE}
    install(monkeypatch, provider)
    response = workspace_client.post('/api/assistant', json=body(workspace_client,
        history=[{'role': 'assistant', 'content': 'x' * 6000}] * 12))
    assert response.status_code == 502


def test_invalid_scope_is_rejected_before_any_paid_round(workspace_client, monkeypatch):
    async def forbidden(*args):
        pytest.fail('Invalid filters must not invoke a model')
    install(monkeypatch, forbidden)
    response = workspace_client.post('/api/assistant', json=body(workspace_client, focus={'filters': {'scoreTo': 101}}))
    assert response.status_code == 400
    assert not workspace_client.app.state.db.get_caches('assistant_attempt')


def test_selected_version_comparison_is_server_bound_before_generation(workspace_client, monkeypatch):
    async def provider(data, callback, on_delta=None):
        selected = data['facts']['selectedComparison']
        assert selected['fromVersion'] == selected['toVersion'] == 1
        assert selected['changes'] == [] and selected['scoreImpact'] is None
        send_receipt(callback)
        return {'value': step('Выбрана одна и та же версия.', sourceIds=[selected['sourceId']],
                              actionIds=[selected['actionId']]), 'usage': USAGE}
    install(monkeypatch, provider)
    response = workspace_client.post('/api/assistant', json=body(workspace_client,
        focus={'comparison': {'fromVersion': 1, 'toVersion': 1}}))
    assert response.status_code == 200, response.text
    assert response.json()['actions'][0]['type'] == 'compare_versions'
    assert response.json()['sources'][0]['fromVersion'] == 1


def test_unknown_selected_version_never_starts_provider(workspace_client, monkeypatch):
    async def forbidden(*args):
        pytest.fail('Unknown version must fail before paid generation')
    install(monkeypatch, forbidden)
    response = workspace_client.post('/api/assistant', json=body(workspace_client,
        focus={'comparison': {'fromVersion': 1, 'toVersion': 999}}))
    assert response.status_code == 400
    assert not workspace_client.app.state.db.get_caches('assistant_attempt')


def test_global_search_reads_other_conversations_despite_page_focus(workspace_client, monkeypatch):
    target = workspace_client.app.state.db.get_conversation('p1-ru-007')
    async def provider(data, callback, on_delta=None):
        send_receipt(callback)
        if data['phase'] == 'research':
            return {'value': step('', toolCalls=[tool('search_conversations', query=f"#{target['number']}")])}
        found = data['toolResults'][0]['result']
        assert found['count'] == 1
        item = found['conversations'][0]
        assert item['conversationId'] == target['id'] and item['turns']
        assert data['focus']['filters']['conversationIds'] == [CID]
        return {'value': step('Найдено нужное обращение.', sourceIds=[item['sourceId']],
                              actionIds=[item['actionId']])}
    install(monkeypatch, provider)
    response = workspace_client.post('/api/assistant', json=body(workspace_client))
    assert response.status_code == 200, response.text
    assert response.json()['sources'][0]['conversationId'] == target['id']
    assert response.json()['usage']['calls'] == 3


def test_focus_aggregates_use_same_shared_cohort(workspace_client, monkeypatch):
    evaluate(workspace_client)
    async def provider(data, callback, on_delta=None):
        send_receipt(callback)
        if data['phase'] == 'research':
            return {'value': step('', toolCalls=[tool('quality_overview', useFocus=True),
                                                tool('topic_breakdown', useFocus=True)])}
        focused = data['toolResults'][0]['result']
        assert focused['scope']['total'] == 1
        assert data['facts']['overview']['scope']['total'] == 65
        source = next(s for s in data['sources'] if s['id'] == focused['sourceId'])
        assert source['filters']['conversationIds'] == [CID]
        return {'value': step(sourceIds=[focused['sourceId']])}
    install(monkeypatch, provider)
    assert workspace_client.post('/api/assistant', json=body(workspace_client)).status_code == 200


def test_selected_historical_snapshot_does_not_replace_current_global_read(workspace_client, monkeypatch):
    ev = evaluate(workspace_client)[0]
    db = workspace_client.app.state.db
    original = db.get_conversation(CID)
    changed = deepcopy(original)
    changed['transcriptHash'] = 'replacement-source'
    changed['transcript'][0]['text'] = 'Новое текущее содержание'
    db.save_conversation(changed)
    async def provider(data, callback, on_delta=None):
        send_receipt(callback)
        historical = data['facts']['selectedConversation']
        assert historical['assessment']['evaluation']['id'] == ev['id']
        if data['phase'] == 'research':
            return {'value': step('', toolCalls=[tool('read_conversations', conversationIds=[CID])])}
        current = data['toolResults'][0]['result']['conversations'][0]
        assert current['turns'][0]['text'] == changed['transcript'][0]['text']
        assert current['assessment'] is None
        assert historical['sourceId'] != current['sourceId']
        return {'value': step(sourceIds=[historical['sourceId'], current['sourceId']])}
    install(monkeypatch, provider)
    response = workspace_client.post('/api/assistant', json=body(workspace_client, focus={'conversation': {
        'conversationId': CID, 'evaluationId': ev['id'], 'transcriptHash': original['transcriptHash']}}))
    assert response.status_code == 200, response.text
    assert {s['transcriptHash'] for s in response.json()['sources']} == {original['transcriptHash'], 'replacement-source'}


def test_review_revises_private_draft_and_only_final_provider_deltas_are_visible(workspace_client, monkeypatch):
    phases = []
    async def provider(data, callback, on_delta=None):
        phases.append(data['phase'])
        send_receipt(callback)
        if data['phase'] == 'research':
            assert on_delta is None
            return {'value': step('Непроверенное правило в черновике.')}
        assert data['phase'] == 'final_review' and data['toolsAllowed'] is False
        assert data['draft']['answer'] == 'Непроверенное правило в черновике.'
        await on_delta('Уточните ')
        await on_delta('условие у ответственной команды.')
        return {'value': step('Уточните условие у ответственной команды.')}
    install(monkeypatch, provider)
    response = workspace_client.post('/api/assistant?stream=true', json=body(workspace_client))
    events = [json.loads(line) for line in response.text.splitlines()]
    assert phases == ['research', 'final_review']
    assert ''.join(e['text'] for e in events if e['type'] == 'answer_delta') == events[-1]['result']['answer']
    assert 'Непроверенное правило' not in response.text
    assert [e['stage'] for e in events if e['type'] == 'progress'] == ['analyzing', 'checking', 'answering']
    assert events[-1]['type'] == 'done' and events[-1]['result']['usage']['calls'] == 2


@pytest.mark.parametrize('failure', ['transport', 'malformed', 'invented_source', 'stale'])
def test_partial_review_failure_emits_error_and_no_completion(workspace_client, monkeypatch, failure):
    async def provider(data, callback, on_delta=None):
        if data['phase'] == 'research':
            send_receipt(callback)
            return {'value': step('Предварительный разбор.', sourceIds=[data['facts']['selectedConversation']['sourceId']])}
        callback({'stage': 'sending', 'model': 'test'})
        await on_delta('Ответ ещё формируется')
        if failure == 'transport':
            callback({'stage': 'finished', 'status': 'interrupted', 'usage': None})
            raise JudgeError('Stream disconnected')
        callback({'stage': 'finished', 'status': 'received', 'usage': USAGE})
        if failure == 'malformed':
            return {'value': {'answer': 'not complete'}}
        if failure == 'invented_source':
            return {'value': step('Ответ ещё формируется', sourceIds=['forged'])}
        changed = workspace_client.app.state.db.get_conversation(CID)
        changed['transcriptHash'] = 'changed-mid-stream-' + str(data['round'])
        workspace_client.app.state.db.save_conversation(changed)
        return {'value': step('Ответ ещё формируется', sourceIds=[data['facts']['selectedConversation']['sourceId']])}
    install(monkeypatch, provider)
    original = workspace_client.app.state.db.get_conversation(CID)
    response = workspace_client.post('/api/assistant?stream=true', json=body(workspace_client, focus={'conversation': {
        'conversationId': CID, 'transcriptHash': original['transcriptHash']}}))
    events = [json.loads(line) for line in response.text.splitlines()]
    assert any(e['type'] == 'answer_delta' for e in events)
    assert events[-1]['type'] == 'error'
    assert not any(e['type'] == 'done' for e in events)
    assert events[-1]['usage']['calls'] == (3 if failure == 'stale' else 2)
    assert events[-1]['usageIncomplete'] is (failure == 'transport')
    assert known_cost(workspace_client) == (.002 if failure == 'transport' else .006 if failure == 'stale' else .004)


def test_search_auto_reads_share_budget_and_never_claim_full_coverage(workspace_client):
    workspace = aw.Workspace(workspace_client.app, aw.WorkspaceRequest.model_validate(body(workspace_client)))
    first = workspace.execute(aw.ToolCall.model_validate(tool('search_conversations', limit=15)))
    assert first['count'] == 65 and first['truncated']
    assert len(first['conversations']) == 3
    second = workspace.execute(aw.ToolCall.model_validate(tool('search_conversations',
        filters=[{'field': 'languages', 'value': 'EN'}], limit=15)))
    actual_reads = [c for c in second['conversations'] if 'turns' in c]
    assert len(actual_reads) == 2
    assert len(workspace.read_ids) == 5
    assert any(c.get('unavailable') == 'conversation_read_limit' for c in second['conversations'])
    assert workspace.transcript_chars <= aw.MAX_TRANSCRIPT_CHARS


def test_streamed_answer_whitespace_matches_validated_completion(workspace_client, monkeypatch):
    final = '  Ответ с исходными пробелами.\n'
    async def provider(data, callback, on_delta=None):
        send_receipt(callback)
        if on_delta:
            await on_delta(final[:2])
            await on_delta(final[2:])
        return {'value': step(final)}
    install(monkeypatch, provider)
    response = workspace_client.post('/api/assistant?stream=true', json=body(workspace_client))
    events = [json.loads(line) for line in response.text.splitlines()]
    assert ''.join(e['text'] for e in events if e['type'] == 'answer_delta') == final
    assert events[-1]['result']['answer'] == final


def test_repeated_read_retains_direct_navigation_action(workspace_client):
    workspace = aw.Workspace(workspace_client.app, aw.WorkspaceRequest.model_validate(body(workspace_client)))
    first = workspace.read_conversation(CID)
    second = workspace.read_conversation(CID)
    assert first == second
    assert workspace.actions[second['actionId']]['conversationId'] == CID


def test_focused_search_reads_assessment_for_focused_checklist(workspace_client):
    evaluation = evaluate(workspace_client)[0]
    db = workspace_client.app.state.db
    old = db.get_checklist('cl_1')
    current = deepcopy(old)
    current.update(id='cl_2', version=2, isActive=True)
    old['isActive'] = False
    db.save_checklist(old)
    db.save_checklist(current)
    workspace = aw.Workspace(workspace_client.app, aw.WorkspaceRequest.model_validate(body(workspace_client,
        focus={'filters': {'checklistId': 'cl_1', 'conversationIds': [CID]}})))
    result = workspace.search(aw.ToolCall.model_validate(tool('search_conversations', useFocus=True)))
    read = result['conversations'][0]
    assert read['assessment']['evaluation']['id'] == evaluation['id']
    assert read['assessment']['checklist']['id'] == 'cl_1'
    current_read = workspace.read_conversation(CID)
    assert current_read['assessment'] is None
    assert current_read['sourceId'] != read['sourceId']


def test_final_evidence_audit_stays_private(workspace_client, monkeypatch):
    audit = {'unansweredQuestions': ['Условие не уточнено'],
             'unsupportedDraftClaims': ['Выполним обязательно'],
             'attributionCorrections': ['Подтверждённый регламент']}
    async def provider(data, callback, on_delta=None):
        send_receipt(callback)
        if data['phase'] == 'final_review':
            await on_delta('Уточню условие.')
        return {'value': step('Уточню условие.', factAudit=audit)}
    install(monkeypatch, provider)
    response = workspace_client.post('/api/assistant?stream=true', json=body(workspace_client))
    events = [json.loads(line) for line in response.text.splitlines()]
    assert events[-1]['type'] == 'done'
    assert 'factAudit' not in response.text
    assert 'Выполним обязательно' not in response.text


@pytest.mark.parametrize('audit', [None, {}, {'unansweredQuestions': [], 'unsupportedDraftClaims': [],
    'attributionCorrections': ['x' * 501]}])
def test_missing_or_invalid_final_audit_never_completes(workspace_client, monkeypatch, audit):
    async def provider(data, callback, on_delta=None):
        send_receipt(callback)
        value = step()
        if data['phase'] == 'final_review':
            value['factAudit'] = audit
        return {'value': value}
    install(monkeypatch, provider)
    response = workspace_client.post('/api/assistant?stream=true', json=body(workspace_client))
    events = [json.loads(line) for line in response.text.splitlines()]
    assert events[-1]['type'] == 'error'
    assert events[-1]['error']['code'] == 'model_failed'
    assert not any(e['type'] == 'done' for e in events)
    assert known_cost(workspace_client) == .004


def test_weight_only_comparison_carries_conditional_reuse_without_claiming_eligible_records(workspace_client, monkeypatch):
    db = workspace_client.app.state.db
    updated = deepcopy(db.get_checklist('cl_1'))
    updated.update(id='cl_reweighted', version=2, isActive=False)
    criterion = next(c for c in updated['criteria'] if c['id'] == 'contact')
    criterion['weight'] = 12
    db.save_checklist(updated)
    phases = []
    async def provider(data, callback, on_delta=None):
        phases.append(data['phase'])
        comparison = data['facts']['selectedComparison']
        change = next(c for c in comparison['changes'] if c['criterionId'] == 'contact')
        assert change['fields'] == ['weight'] and change['contentChanged'] is False
        assert change['before']['weight'] == 10 and change['after']['weight'] == 12
        reuse = comparison['reuseGuidance']
        assert reuse['eligibilityChecked'] is False
        assert len(reuse['requiredConditions']) == 3
        conditions = ' '.join(reuse['requiredConditions']).lower()
        assert all(term in conditions for term in ('saved', 'completed', 'compatible', 'transcript', 'provider', 'model', 'semantics'))
        assert 'new evaluation may be needed' in reuse['ifNotMet'].lower()
        assert 'does not guarantee zero model calls' in reuse['ifNotMet']
        assert 'does not check saved records' in reuse['limits']
        send_receipt(callback)
        return {'value': step('Вес изменён; возможность повторного использования зависит от сохранённых ответов.',
                              sourceIds=[comparison['sourceId']])}
    install(monkeypatch, provider)
    response = workspace_client.post('/api/assistant', json=body(workspace_client,
        focus={'comparison': {'fromVersion': 1, 'toVersion': 2}}))
    assert response.status_code == 200, response.text
    assert phases == ['research', 'final_review']
    assert response.json()['sources'][0]['type'] == 'checklist_comparison'

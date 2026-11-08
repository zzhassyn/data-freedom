"""Granular source validity and one bounded recovery during concurrent updates."""
import asyncio
from copy import deepcopy
import json

import pytest

from app import assistant_workspace as aw, topics
from app.errors import ApiError
from tests.helpers import evaluate
from tests.test_assistant_workspace import (
    CID, USAGE, body, install, known_cost, send_receipt, step, tool, workspace_client,
)


def focused(client, evaluation=None):
    conv = client.app.state.db.get_conversation(CID)
    selection = {'conversationId': CID, 'transcriptHash': conv['transcriptHash']}
    if evaluation:
        selection['evaluationId'] = evaluation['id']
    return body(client, focus={'conversation': selection})


def assign_topic(client, cid='p1-ru-007'):
    db = client.app.state.db
    conversation = db.get_conversation(cid)
    db.set_cache('topic_catalog', topics.VERSION, {'topics': [{'id': 'test-topic', 'title': 'Новая тема'}]})
    db.set_cache('topic', cid, {'sourceHash': conversation['transcriptHash'],
        'providerIdentity': topics.identity(client.app),
        'result': {'topicId': 'test-topic', 'resolutionStatus': 'unresolved'}})


def change_transcript(client, text='Обновлённый вопрос клиента.', suffix='new'):
    db = client.app.state.db
    conversation = db.get_conversation(CID)
    conversation['transcript'][0]['text'] = text
    conversation['transcriptHash'] = suffix
    db.save_conversation(conversation)


def cite_source(source, answer='Ответ по подтверждённому источнику.'):
    turn = source['turns'][0]
    return step(answer, sourceIds=[source['sourceId']], citations=[{
        'sourceId': source['sourceId'], 'turnIdx': turn['idx'], 'quote': turn['text']}])


def test_cited_historical_answer_survives_unrelated_topic_completion(workspace_client, monkeypatch):
    evaluation = evaluate(workspace_client)[0]
    async def provider(data, callback, on_delta=None):
        send_receipt(callback)
        assign_topic(workspace_client)
        return {'value': cite_source(data['facts']['selectedConversation'])}
    install(monkeypatch, provider)
    response = workspace_client.post('/api/assistant?stream=true', json=focused(workspace_client, evaluation))
    events = [json.loads(line) for line in response.text.splitlines()]
    assert events[-1]['type'] == 'done', events
    assert events[-1]['result']['usage']['calls'] == 2
    assert not any(event['type'] == 'answer_reset' for event in events)
    assert events[-1]['result']['citations'][0]['evaluationId'] == evaluation['id']


def test_comparison_answer_survives_unrelated_topic_completion(workspace_client, monkeypatch):
    async def provider(data, callback, on_delta=None):
        send_receipt(callback)
        assign_topic(workspace_client)
        source = data['facts']['selectedComparison']
        return {'value': step(sourceIds=[source['sourceId']], actionIds=[source['actionId']])}
    install(monkeypatch, provider)
    response = workspace_client.post('/api/assistant', json=body(workspace_client,
        focus={'comparison': {'fromVersion': 1, 'toVersion': 1}}))
    assert response.status_code == 200, response.text
    assert response.json()['usage']['calls'] == 2


def test_changed_referenced_current_transcript_refreshes_before_final_answer(workspace_client, monkeypatch):
    seen = []
    async def provider(data, callback, on_delta=None):
        send_receipt(callback)
        source = data['facts']['selectedConversation']
        seen.append(source['turns'][0]['text'])
        if data['round'] == 1:
            change_transcript(workspace_client)
        else:
            assert data['sourceRefresh'] is True
            assert source['turns'][0]['text'] == 'Обновлённый вопрос клиента.'
            assert list(data['draft']) == ['answer']
        return {'value': cite_source(source)}
    install(monkeypatch, provider)
    response = workspace_client.post('/api/assistant?stream=true', json=focused(workspace_client))
    events = [json.loads(line) for line in response.text.splitlines()]
    result = events[-1]['result']
    assert events[-1]['type'] == 'done' and len(seen) == 2 and seen[0] != seen[1]
    assert sum(e['type'] == 'answer_reset' for e in events) == 1
    assert result['citations'][0]['quote'] == 'Обновлённый вопрос клиента.'
    assert result['citations'][0]['transcriptHash'] == 'new'
    assert result['usage']['calls'] == 2 and known_cost(workspace_client) == .004


def test_final_stream_change_resets_provisional_text_and_uses_third_call(workspace_client, monkeypatch):
    async def provider(data, callback, on_delta=None):
        send_receipt(callback)
        source = data['facts']['selectedConversation']
        answer = 'Новый ответ.' if data.get('sourceRefresh') else 'Предыдущий ответ.'
        if on_delta:
            await on_delta(answer)
        if data['round'] == 2:
            change_transcript(workspace_client)
        return {'value': cite_source(source, answer)}
    install(monkeypatch, provider)
    response = workspace_client.post('/api/assistant?stream=true', json=focused(workspace_client))
    events = [json.loads(line) for line in response.text.splitlines()]
    reset = next(i for i, event in enumerate(events) if event['type'] == 'answer_reset')
    assert [e['text'] for e in events[:reset] if e['type'] == 'answer_delta'] == ['Предыдущий ответ.']
    assert [e['text'] for e in events[reset:] if e['type'] == 'answer_delta'] == ['Новый ответ.']
    result = events[-1]['result']
    assert result['answer'] == 'Новый ответ.' and result['citations'][0]['transcriptHash'] == 'new'
    assert result['usage']['calls'] == 3 and known_cost(workspace_client) == .006
    assert len(workspace_client.app.state.db.get_caches('assistant_attempt')) == 3


def test_historical_snapshot_survives_replacement_of_current_transcript(workspace_client, monkeypatch):
    evaluation = evaluate(workspace_client)[0]
    request = focused(workspace_client, evaluation)
    original_hash = request['focus']['conversation']['transcriptHash']
    async def provider(data, callback, on_delta=None):
        send_receipt(callback)
        change_transcript(workspace_client)
        source = data['facts']['selectedConversation']
        assert source['assessment']['evaluation']['id'] == evaluation['id']
        assert source['turns'][0]['text'] != 'Обновлённый вопрос клиента.'
        return {'value': cite_source(source)}
    install(monkeypatch, provider)
    response = workspace_client.post('/api/assistant', json=request)
    assert response.status_code == 200, response.text
    assert response.json()['citations'][0]['transcriptHash'] == original_hash
    assert response.json()['usage']['calls'] == 2


def test_changed_selected_assessment_refreshes_without_changing_its_identity(workspace_client, monkeypatch):
    evaluation = evaluate(workspace_client)[0]
    async def provider(data, callback, on_delta=None):
        send_receipt(callback)
        source = data['facts']['selectedConversation']
        if data['round'] == 1:
            changed = workspace_client.app.state.db.get_evaluation(evaluation['id'])
            changed['total'] = 42
            workspace_client.app.state.db.save_evaluation(changed)
        else:
            assert data['sourceRefresh'] and source['assessment']['evaluation']['total'] == 42
            assert source['assessment']['evaluation']['id'] == evaluation['id']
        return {'value': cite_source(source)}
    install(monkeypatch, provider)
    response = workspace_client.post('/api/assistant', json=focused(workspace_client, evaluation))
    assert response.status_code == 200, response.text
    assert response.json()['usage']['calls'] == 2


def test_selected_topics_refresh_but_unused_topics_do_not_invalidate_other_sources(workspace_client, monkeypatch):
    seen = []
    async def provider(data, callback, on_delta=None):
        send_receipt(callback)
        report = data['facts']['topics']
        seen.append(report['analyzed'])
        if data['round'] == 1:
            assign_topic(workspace_client)
        return {'value': step(sourceIds=[report['sourceId']])}
    install(monkeypatch, provider)
    response = workspace_client.post('/api/assistant', json=body(workspace_client))
    assert response.status_code == 200, response.text
    assert seen == [0, 1] and response.json()['usage']['calls'] == 2


def test_action_only_answer_validates_and_emits_its_source_dependency(workspace_client, monkeypatch):
    async def provider(data, callback, on_delta=None):
        send_receipt(callback)
        source = data['facts']['selectedConversation']
        if data['round'] == 1:
            change_transcript(workspace_client)
        return {'value': step(actionIds=[source['actionId']])}
    install(monkeypatch, provider)
    response = workspace_client.post('/api/assistant', json=focused(workspace_client))
    assert response.status_code == 200, response.text
    result = response.json()
    assert result['actions'][0]['transcriptHash'] == 'new'
    assert result['sources'][0]['transcriptHash'] == 'new'
    assert result['usage']['calls'] == 2


def test_no_declared_sources_conservatively_checks_provided_payloads(workspace_client, monkeypatch):
    seen = []
    async def provider(data, callback, on_delta=None):
        send_receipt(callback)
        seen.append(data['facts']['topics']['analyzed'])
        if data['round'] == 1:
            assign_topic(workspace_client)
        return {'value': step()}
    install(monkeypatch, provider)
    response = workspace_client.post('/api/assistant', json=body(workspace_client))
    assert response.status_code == 200 and seen == [0, 1]


def test_search_filter_and_rows_share_frozen_snapshot(workspace_client):
    evaluation = evaluate(workspace_client)[0]
    db = workspace_client.app.state.db
    original = db.get_evaluation(evaluation['id'])
    original['total'] = 90
    db.save_evaluation(original)
    workspace = aw.Workspace(workspace_client.app, aw.WorkspaceRequest.model_validate(body(workspace_client)))
    changed = deepcopy(original)
    changed['total'] = 10
    db.save_evaluation(changed)
    found = workspace.search(aw.ToolCall.model_validate(tool('search_conversations', useFocus=True,
        filters=[{'field': 'scoreFrom', 'value': '80'}])))
    assert found['count'] == 1 and found['rows'][0]['total'] == 90
    with pytest.raises(ApiError) as failure:
        workspace.finish(aw.Step.model_validate(step(sourceIds=[found['sourceId']])))
    assert failure.value.code == 'assistant_source_changed'


def test_preflight_stale_focus_has_distinct_code_and_zero_attempts(workspace_client, monkeypatch):
    request = focused(workspace_client)
    change_transcript(workspace_client)
    async def forbidden(*args):
        pytest.fail('Preflight refresh must happen before paid dispatch')
    install(monkeypatch, forbidden)
    response = workspace_client.post('/api/assistant', json=request)
    assert response.status_code == 409
    assert response.json()['error']['code'] == 'assistant_focus_stale'
    assert not workspace_client.app.state.db.get_caches('assistant_attempt')


def test_cancel_during_refreshed_round_preserves_prior_bill_and_unknown_attempt(workspace_client, monkeypatch):
    async def scenario():
        workspace = aw.Workspace(workspace_client.app, aw.WorkspaceRequest.model_validate(focused(workspace_client)))
        started = asyncio.Event()
        async def provider(data, callback, on_delta=None):
            if data['round'] == 1:
                send_receipt(callback)
                change_transcript(workspace_client)
                return {'value': cite_source(data['facts']['selectedConversation'])}
            callback({'stage': 'sending', 'model': 'test'})
            started.set()
            try:
                await asyncio.Event().wait()
            finally:
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
            await asyncio.wait_for(started.wait(), 2)
            task.cancel()
            with pytest.raises(asyncio.CancelledError):
                await task
        finally:
            workspace.app.state.queue = original_queue
        usage = workspace.ledger.public_usage()
        assert usage['usage']['calls'] == 2 and usage['usageIncomplete'] is True
        assert known_cost(workspace_client) == .002
        assert len(workspace_client.app.state.db.get_caches('assistant_attempt')) == 2
    asyncio.run(scenario())


def test_repeated_search_limits_keep_distinct_semantic_dependencies(workspace_client):
    workspace = aw.Workspace(workspace_client.app, aw.WorkspaceRequest.model_validate(body(workspace_client)))
    large = workspace.search(aw.ToolCall.model_validate(tool('search_conversations', limit=15)))
    small = workspace.search(aw.ToolCall.model_validate(tool('search_conversations', limit=1)))
    assert large['sourceId'] != small['sourceId']
    later_id = large['rows'][10]['conversationId']
    db = workspace_client.app.state.db
    changed = db.get_conversation(later_id)
    changed['language'] = 'EN' if changed['language'] != 'EN' else 'RU'
    db.save_conversation(changed)
    with pytest.raises(ApiError) as failure:
        workspace.finish(aw.Step.model_validate(step(sourceIds=[large['sourceId']])))
    assert failure.value.code == 'assistant_source_changed'


def test_topic_limits_keep_distinct_semantic_dependencies(workspace_client):
    workspace = aw.Workspace(workspace_client.app, aw.WorkspaceRequest.model_validate(body(workspace_client)))
    assert workspace.topics(1)['sourceId'] != workspace.topics(15)['sourceId']


def test_historical_navigation_does_not_inherit_current_alias_dependency(workspace_client):
    evaluation = evaluate(workspace_client)[0]
    workspace = aw.Workspace(workspace_client.app, aw.WorkspaceRequest.model_validate(focused(workspace_client, evaluation)))
    historical = workspace.initial()['facts']['selectedConversation']
    current = workspace.read_conversation(CID)
    assert historical['actionId'] != current['actionId']
    change_transcript(workspace_client)
    result = workspace.finish(aw.Step.model_validate(step(actionIds=[historical['actionId']])))
    assert result['sources'][0]['snapshotKind'] == 'selected'
    assert result['actions'][0]['evaluationId'] == evaluation['id']

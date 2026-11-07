"""Streaming persistence, billing, provenance and cancellation with no network."""
import asyncio
import json
from types import SimpleNamespace

import pytest

from app import extras, llm_switch
from app.db import Database
from app.errors import ApiError, JudgeError
from app.models import Summary, Usage
from tests.helpers import evaluate


def lines(response):
    assert response.status_code == 200
    assert response.headers['content-type'].startswith('application/x-ndjson')
    return [json.loads(line) for line in response.text.splitlines()]


def cost(db):
    with db.transaction() as connection:
        return connection.execute('SELECT COALESCE(SUM(cost_usd),0) FROM model_calls').fetchone()[0]


def test_summary_partial_then_validated_done_shared_with_json_cache(seeded_client, monkeypatch):
    calls = []
    module = llm_switch.get_ai()

    async def stream(conversation):
        calls.append(conversation.id)
        yield {'type': 'partial', 'value': {'topic': 'Поиск', 'request': 'Где'}}
        yield {'type': 'partial', 'value': {'topic': 'Поиск тарифа', 'request': 'Где найти тариф'}}
        yield {'type': 'done', 'result': Summary(topic='Поиск тарифа', request='Где найти тариф',
            outcome='Клиент нашёл тариф'), 'usage': Usage(calls=1, cost_usd=.003)}

    monkeypatch.setattr(module, 'summarize_stream', stream, raising=False)
    events = lines(seeded_client.get('/api/conversations/p1-ru-001/summary?stream=true'))
    assert [event['type'] for event in events] == ['partial', 'partial', 'done']
    assert events[-1]['result']['outcome'] == 'Клиент нашёл тариф'
    assert seeded_client.get('/api/conversations/p1-ru-001/summary').json() == events[-1]['result']
    assert lines(seeded_client.get('/api/conversations/p1-ru-001/summary?stream=true')) == [events[-1]]
    assert calls == ['p1-ru-001']
    assert cost(seeded_client.app.state.db) == pytest.approx(.003)


@pytest.mark.parametrize('invalid_done', [False, True])
def test_stream_failure_keeps_billed_usage_without_cached_success(seeded_client, monkeypatch, invalid_done):
    async def stream(conversation):
        yield {'type': 'partial', 'value': {'request': 'Частичный текст'}}
        usage = Usage(calls=1, cost_usd=.004)
        if invalid_done:
            yield {'type': 'done', 'result': {'topic': 'Нет остальных полей'}, 'usage': usage}
        else:
            error = JudgeError('Поток прерван')
            error.usage = usage
            raise error

    monkeypatch.setattr(llm_switch.get_ai(), 'summarize_stream', stream, raising=False)
    events = lines(seeded_client.get('/api/conversations/p1-ru-001/summary?stream=true'))
    assert [event['type'] for event in events] == ['partial', 'error']
    assert events[-1]['error']['code'] == 'model_failed'
    assert seeded_client.app.state.db.get_cache('summary', 'p1-ru-001') is None
    assert cost(seeded_client.app.state.db) == pytest.approx(.004)


def test_provider_identity_invalidates_summary_and_persisted_opinion(seeded_client, monkeypatch):
    module = llm_switch.get_ai()
    identity = ['provider:model-A:prompt1']
    monkeypatch.setattr(module, 'cache_identity', lambda: identity[0], raising=False)
    first = seeded_client.get('/api/conversations/p1-ru-001/summary').json()
    evaluation = evaluate(seeded_client)[0]
    appeal = seeded_client.post('/api/appeals', json={'evaluationId': evaluation['id'],
        'criterionId': 'closing', 'comment': 'Проверьте завершение диалога ещё раз.'}).json()
    assert seeded_client.post('/api/appeals/' + appeal['id'] + '/second-opinion', json={}).status_code == 200
    assert seeded_client.get('/api/appeals/' + appeal['id']).json()['secondOpinion'] is not None
    identity[0] = 'provider:model-B:prompt1'
    conversation = seeded_client.app.state.db.get_conversation('p1-ru-001')
    assert extras.get_cached_summary(seeded_client.app.state.db, conversation) is None
    public = seeded_client.get('/api/appeals/' + appeal['id']).json()
    assert public['secondOpinion'] is None
    assert not any(key.startswith('_') for key in public)

    async def changed(conversation):
        return Summary(topic='Новое резюме', request='Запрос', outcome='Итог')

    monkeypatch.setattr(module, 'summarize', changed)
    assert seeded_client.get('/api/conversations/p1-ru-001/summary').json() != first


@pytest.mark.parametrize('mode', ['openrouter', 'real'])
def test_summary_stream_missing_key_fails_before_headers(seeded_client, mode):
    seeded_client.app.state.settings.judge = mode
    response = seeded_client.get('/api/conversations/p1-ru-001/summary?stream=true')
    assert response.status_code == 503
    assert response.json()['error']['code'] == 'model_unavailable'


def test_partial_emits_before_completion_and_disconnect_cancels_provider(tmp_path, monkeypatch):
    async def scenario():
        db = Database(str(tmp_path / 'stream.sqlite'))
        entered = asyncio.Event()
        cancelled = asyncio.Event()
        finish = asyncio.Event()

        async def invoke(function, *args, **kwargs):
            return await function(*args)

        app = SimpleNamespace(state=SimpleNamespace(db=db, queue=SimpleNamespace(call_model=invoke),
            background_tasks=set(), settings=SimpleNamespace(judge='fake', openrouter_api_key='')))
        monkeypatch.setattr(extras, '_cache_identity', lambda app, kind: 'stream-test')

        async def provider():
            try:
                entered.set()
                yield {'type': 'partial', 'value': {'request': 'Уже пришло'}}
                await finish.wait()
                yield {'type': 'done', 'result': {}, 'usage': Usage()}
            finally:
                cancelled.set()

        response = extras._stream_cached(app, 'summary', 'id', 'hash', provider, lambda value: value, lambda: True)
        iterator = response.body_iterator
        first = json.loads(await asyncio.wait_for(anext(iterator), 1))
        assert entered.is_set() and first['type'] == 'partial' and not finish.is_set()
        await iterator.aclose()
        await asyncio.wait_for(cancelled.wait(), 1)
        assert db.get_cache('summary', 'id') is None
        assert not app.state.background_tasks

    asyncio.run(scenario())


def test_source_changed_during_stream_is_never_saved(tmp_path, monkeypatch):
    async def scenario():
        db = Database(str(tmp_path / 'stale.sqlite'))
        current = [True]

        async def invoke(function, *args, **kwargs):
            return await function(*args)

        app = SimpleNamespace(state=SimpleNamespace(db=db, queue=SimpleNamespace(call_model=invoke),
            background_tasks=set(), settings=SimpleNamespace(judge='fake', openrouter_api_key='')))
        monkeypatch.setattr(extras, '_cache_identity', lambda app, kind: 'stream-test')

        async def provider():
            yield {'type': 'partial', 'value': {'request': 'Текст'}}
            current[0] = False
            yield {'type': 'done', 'result': {'request': 'Старый текст'}, 'usage': Usage(calls=1, cost_usd=.002)}

        response = extras._stream_cached(app, 'summary', 'id', 'hash', provider, lambda value: value, lambda: current[0])
        events = [json.loads(event) async for event in response.body_iterator]
        assert events[-1]['type'] == 'error' and events[-1]['error']['code'] == 'stale_source'
        assert db.get_cache('summary', 'id') is None
        assert cost(db) == pytest.approx(.002)

    asyncio.run(scenario())

import asyncio
import time
from copy import deepcopy

import pytest

from app import llm_switch, topics
from app.errors import ApiError
from app.models import TopicAssignment, Usage


def records(client, dev_payload, count=6):
    base = dev_payload['data']['records'][0]
    items = []
    for i in range(count):
        item = deepcopy(base)
        item['conversation_id'] = f'topic-test-{i}'
        item['channel'] = 'agent chat' if i < 3 else 'voice call'
        items.append(item)
    assert client.post('/api/conversations/upload', json=items).status_code == 200
    return items


def provider(monkeypatch):
    calls = []

    async def classify(conv, catalog):
        calls.append((conv.id, deepcopy(catalog)))
        title = 'Вход в приложение' if conv.id != 'topic-test-5' else 'Вывод средств'
        existing = next((t for t in catalog if t['title'] == title), None)
        return TopicAssignment(topic_id=existing['id'] if existing else None,
                               new_title=None if existing else title,
                               resolution_status='resolved', usage=Usage(calls=1))

    monkeypatch.setattr(llm_switch.get_ai(), 'classify_topic', classify, raising=False)
    return calls


def test_semantic_catalog_counts_threshold_channel_and_cache(client, dev_payload, monkeypatch):
    records(client, dev_payload)
    calls = provider(monkeypatch)
    for i in range(6):
        client.portal.call(topics.classify, client.app, f'topic-test-{i}')
    data = client.get('/api/topics').json()
    assert data['analyzed'] == 6 and data['pending'] == 0
    assert [(r['topic'], r['count']) for r in data['rows']] == [('Вход в приложение', 5)]
    assert data['hiddenCount'] == 1
    assert data['rows'][0]['resolved'] == 5
    assert len(data['rows'][0]['conversationIds']) == 5
    assert calls[0][1] == [] and calls[1][1][0]['title'] == 'Вход в приложение'
    assert client.get('/api/topics?channel=chats').json()['rows'][0]['count'] == 3
    calls_report = client.get('/api/topics?channel=calls').json()
    assert calls_report['rows'] == [] and calls_report['hiddenCount'] == 3
    client.portal.call(topics.classify, client.app, 'topic-test-0')
    assert len(calls) == 6
    assert len(topics.catalog(client.app.state.db)) == 2  # Rare topics are still classified.


def test_changed_transcript_excludes_old_topic_and_reclassifies(client, dev_payload, monkeypatch):
    items = records(client, dev_payload, 3)
    calls = provider(monkeypatch)
    for i in range(3):
        client.portal.call(topics.classify, client.app, f'topic-test-{i}')
    items[0]['transcript'][0]['text'] += ' Дополнительный запрос.'
    assert client.post('/api/conversations/upload', json=[items[0]]).status_code == 200
    data = client.get('/api/topics').json()
    assert data['pending'] == 1 and data['rows'] == []
    client.portal.call(topics.classify, client.app, 'topic-test-0')
    assert len(calls) == 4 and client.get('/api/topics').json()['rows'][0]['count'] == 3


def test_concurrent_classification_shares_catalog_and_calls_once(client, dev_payload, monkeypatch):
    records(client, dev_payload, 1)
    calls = provider(monkeypatch)

    async def run():
        await asyncio.gather(*(topics.classify(client.app, 'topic-test-0') for _ in range(3)))

    client.portal.call(run)
    assert len(calls) == 1 and len(topics.catalog(client.app.state.db)) == 1


def test_failure_does_not_cache_or_invent_topic(client, dev_payload, monkeypatch):
    records(client, dev_payload, 1)

    async def invalid(*args):
        return TopicAssignment(topic_id='made-up', resolution_status='unknown')

    monkeypatch.setattr(llm_switch.get_ai(), 'classify_topic', invalid, raising=False)
    with pytest.raises(ApiError):
        client.portal.call(topics.classify, client.app, 'topic-test-0')
    assert client.get('/api/topics').json()['pending'] == 1
    assert topics.catalog(client.app.state.db) == []


def test_unclear_request_is_saved_but_never_a_topic(client, dev_payload, monkeypatch):
    records(client, dev_payload, 3)

    async def unclear(*args):
        return TopicAssignment(resolution_status='unknown')

    monkeypatch.setattr(llm_switch.get_ai(), 'classify_topic', unclear, raising=False)
    for i in range(3):
        client.portal.call(topics.classify, client.app, f'topic-test-{i}')
    data = client.get('/api/topics').json()
    assert data['rows'] == [] and data['analyzed'] == 3 and data['unidentified'] == 3


def test_read_only_report_never_calls_provider(client, dev_payload, monkeypatch):
    records(client, dev_payload, 1)
    calls = provider(monkeypatch)
    assert client.get('/api/topics').json()['pending'] == 1
    assert calls == []
    assert client.get('/api/topics?channel=invalid').status_code == 400


def test_background_analysis_and_repeat_reuse_saved_results(client, dev_payload, monkeypatch):
    records(client, dev_payload, 3)
    calls = provider(monkeypatch)
    response = client.post('/api/topics/analyze', json={})
    assert response.status_code == 200
    deadline = time.monotonic() + 5
    while time.monotonic() < deadline:
        data = client.get('/api/topics').json()
        if data['job']['status'] != 'running':
            break
        time.sleep(.01)
    assert data['job']['status'] == 'done' and data['rows'][0]['count'] == 3
    assert client.post('/api/topics/analyze', json={}).json()['total'] == 0
    assert len(calls) == 3

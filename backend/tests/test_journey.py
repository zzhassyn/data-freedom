"""HTTP demo/control journey with file fixtures, never real-model acceptance.

The second group is a renamed copy of DEV. Its explicit test judge adapter maps
only the five known fixture IDs back to their prerecorded answers. Template
changes exercise invalidation/reuse, not the semantic accuracy of a new rule.
STT uses synthetic word timings derived from the already-masked source text.
No browser, real audio, external provider, or genuine control dataset is tested.
"""
from collections import Counter
from copy import deepcopy
from decimal import Decimal, ROUND_HALF_UP
import json
from pathlib import Path
import time

from fastapi.testclient import TestClient
import httpx

from app import llm_switch
from tests.helpers import create_app
from app.settings import Settings
from app.stt import audio, provider
from tests.helpers import evaluate


KNOWN_IDS = ['p1-ru-001', 'p1-ru-007', 'p1-kz-003', 'p1-en-002', 'p4-ru-001']
# Field values from the two existing web/js/templates.js templates. Identity,
# section, order and weight remain the original closing criterion's values.
TEMPLATES = [
    {
        'title': 'Корректное прощание с итогом',
        'description': 'Да, если в конце разговора оператор коротко повторил результат или следующий шаг клиента и попрощался. Нет, если оператор сам завершил разговор без итога или без прощания.',
        'naCondition': 'Клиент прервал разговор или связь оборвалась до того, как оператор получил возможность подвести итог и попрощаться.',
    },
    {
        'title': 'Предложение дополнительной помощи',
        'description': 'Да, если после ответа на основной запрос и до завершения разговора оператор спросил, остались ли вопросы, или предложил дополнительную помощь. Нет, если оператор завершил разговор, не сделав этого.',
        'naCondition': 'Клиент прервал разговор до того, как оператор получил возможность предложить дополнительную помощь.',
    },
]


def _wait_stt(client, group):
    deadline = time.monotonic() + 10
    while time.monotonic() < deadline:
        response = client.get('/api/stt/jobs', params={'groupId': group})
        assert response.status_code == 200
        jobs = response.json()
        if jobs['done'] + jobs['failed'] == jobs['total'] == 5:
            assert jobs['done'] == 5, [(item['conversationId'], item['status'], item['error']) for item in jobs['items']]
            return
        time.sleep(0.01)
    raise AssertionError('Synthetic transcription queue did not finish')


def _journey_for_group(client, group, prefix, template, judge_calls):
    checklist = client.get('/api/checklists/active').json()
    assert client.put('/api/source', json={'groupId': group}).status_code == 200
    imported = client.post('/api/source/sync', json={})
    assert imported.status_code == 200, imported.text
    result = imported.json()
    assert (result['imported'], result['updated'], result['unchanged']) == (65, 0, 0)
    assert len(result['newConversationIds']) == 65 and result['existingConversationIds'] == []
    assert result['sttQueued'] == 5 and result['evaluationJob'] is None
    _wait_stt(client, group)
    registry = client.get('/api/conversations', params={'groupId': group}).json()['items']
    identities = {row['id']: (row['number'], row['startedAt']) for row in registry}
    assert len(identities) == 65

    repeated = client.post('/api/source/sync', json={}).json()
    assert (repeated['imported'], repeated['updated'], repeated['unchanged']) == (0, 0, 65)
    assert repeated['newConversationIds'] == [] and set(repeated['existingConversationIds']) == set(identities)
    assert repeated['sttQueued'] == 0 and repeated['evaluationJob'] is None
    assert {row['id']: (row['number'], row['startedAt']) for row in
            client.get('/api/conversations', params={'groupId': group}).json()['items']} == identities

    ids = [prefix + cid for cid in KNOWN_IDS]
    start = len(judge_calls)
    initial = evaluate(client, ids, checklist['id'], reuse=False)
    assert all(ev['status'] == 'done' for ev in initial)
    assert len(judge_calls) - start == len(ids) * len(checklist['criteria'])
    assert any(item['answer'] == 'na' and item['naReason'] for ev in initial for item in ev['items'])
    by_id = {ev['conversationId']: ev for ev in initial}
    selected = by_id[ids[0]]
    closing = next(item for item in selected['items'] if item['criterionId'] == 'closing')
    assert closing['answer'] == 'no'
    original_conversation = client.get('/api/conversations/' + ids[0]).json()
    for ev in initial:
        snapshot = client.get(f"/api/evaluations/{ev['id']}/conversation").json()
        turns = {turn['idx']: turn['text'] for turn in snapshot['transcript']}
        assert all(evidence['quote'] in turns[evidence['turnIdx']]
                   for item in ev['items'] for evidence in item['evidence'])

    appeal_response = client.post('/api/appeals', json={
        'evaluationId': selected['id'], 'criterionId': 'closing', 'proposedAnswer': 'yes',
        'comment': 'Проверьте завершение: клиент подтвердил, что нашёл нужный раздел.',
    })
    assert appeal_response.status_code == 201, appeal_response.text
    appeal = appeal_response.json()
    details = client.get('/api/appeals/' + appeal['id']).json()
    assert details['conversation'] == original_conversation
    decision_response = client.post(f"/api/appeals/{appeal['id']}/decision", json={
        'action': 'change', 'newAnswer': 'yes',
        'reason': 'В этом сценарии проверяющий принял подтверждение клиента как завершение.',
    })
    assert decision_response.status_code == 200, decision_response.text
    decided = decision_response.json()
    reviewed = decided['evaluation']
    assert decided['appeal']['status'] == 'changed'
    assert reviewed['originalTotal'] == selected['total'] < reviewed['total']
    reviewed_closing = next(item for item in reviewed['items'] if item['criterionId'] == 'closing')
    assert reviewed_closing['answer'] == 'yes' and reviewed_closing['original']['answer'] == 'no'

    draft = deepcopy(checklist)
    for field in ('id', 'version', 'createdAt'):
        draft.pop(field)
    draft.update(basedOnVersion=checklist['version'], isActive=False)
    next(item for item in draft['criteria'] if item['id'] == 'closing').update(template)
    created = client.post('/api/checklists', json=draft)
    assert created.status_code == 201, created.text
    target = created.json()
    assert client.get('/api/checklists/' + checklist['id']).json() == checklist
    difference = client.get(f"/api/checklists/{target['id']}/diff", params={'against': checklist['id']}).json()
    assert difference['added'] == difference['removed'] == []
    assert len(difference['changed']) == 1 and difference['changed'][0]['criterionId'] == 'closing'
    assert 'description' in difference['changed'][0]['fields']
    assert client.post(f"/api/checklists/{target['id']}/activate", json={}).status_code == 200
    assert client.get('/api/checklists/active').json()['id'] == target['id']

    start = len(judge_calls)
    applied = evaluate(client, ids, target['id'], reuse=True)
    assert all(ev['status'] == 'done' for ev in applied)
    assert Counter(judge_calls[start:]) == Counter((cid, 'closing') for cid in ids)
    assert sum(ev['usage']['calls'] for ev in applied) == len(ids)
    for ev in applied:
        assert all(item['reused'] == (item['criterionId'] != 'closing') for item in ev['items'])
    # A new immutable version gets its own model answers; it does not overwrite
    # the earlier human decision, and the comparison uses that final old total.
    assert client.get('/api/evaluations/' + selected['id']).json() == reviewed
    after_by_id = {ev['conversationId']: ev for ev in applied}
    assert after_by_id[ids[0]]['total'] == selected['total']
    before_by_id = {**by_id, ids[0]: reviewed}
    comparison_response = client.get(f"/api/checklists/{target['id']}/compare",
                                     params={'against': checklist['id'], 'groupId': group})
    assert comparison_response.status_code == 200
    comparison = comparison_response.json()
    assert {row['conversationId'] for row in comparison['items']} == set(ids)
    deltas = []
    for row in comparison['items']:
        cid = row['conversationId']
        assert row['before'] == before_by_id[cid]['total'] and row['after'] == after_by_id[cid]['total']
        deltas.append(Decimal(str(row['after'])) - Decimal(str(row['before'])))
        assert row['changed'] == ([{'criterionId': 'closing', 'before': 'yes', 'after': 'no'}] if cid == ids[0] else [])
    mean = float((sum(deltas) / len(deltas)).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP))
    assert comparison['summary'] == {'total': 5, 'changedCount': 1, 'avgDelta': mean}
    return identities, {cid: ev['id'] for cid, ev in after_by_id.items()}


def test_dev_then_renamed_control_fixture_journey(tmp_path, monkeypatch):
    payload = json.loads((Path(__file__).parent / 'data' / 'dev.json').read_text(encoding='utf-8-sig'))
    control = deepcopy(payload)
    control['data']['dataset_group_id'] = 'CTRL-FIXTURE'
    aliases = {}
    for record in control['data']['records']:
        source_id = record['conversation_id']
        record['conversation_id'] = 'control-' + source_id
        aliases[record['conversation_id']] = source_id
    datasets = {'DEV': payload, 'CTRL-FIXTURE': control}
    audio_sources = {record['audio_url']: record['transcript'] for record in payload['data']['records'] if record['audio_url']}
    judge_calls, stt_calls = [], []

    async def no_network(*args, **kwargs):
        raise AssertionError('External network is forbidden in the fixture journey')
    async def file_dataset(_request, group_id):
        return deepcopy(datasets[group_id])
    async def download(url, _hosts, path):
        path.write_text(json.dumps(audio_sources[url], ensure_ascii=False), encoding='utf-8')
        return None
    async def inspect(_path, _declared):
        return audio.AudioInfo(declared=300, decoded=300, check='checked')
    async def transcribe(path, _settings):
        stt_calls.append(True)
        turns = json.loads(path.read_text(encoding='utf-8'))
        words = []
        for turn in turns:
            if turn['speaker'] == 'system':
                continue
            for word in turn['text'].split():
                start = len(words) * 0.25
                words.append({'word': word, 'speaker': turn['speaker'], 'start': start, 'end': start + 0.2})
        return {'words': words, 'duration': len(words) * 0.25, 'usage': {'seconds': 0}}

    monkeypatch.setattr(httpx.AsyncClient, 'send', no_network)
    monkeypatch.setattr('app.conversations.fetch_dataset', file_dataset)
    monkeypatch.setattr(audio, 'download_audio', download)
    monkeypatch.setattr(audio, 'inspect_audio', inspect)
    monkeypatch.setattr(provider, 'transcribe', transcribe)
    settings = Settings(db_path=tmp_path / 'journey.sqlite',
                        auto_summarize=False, auto_evaluate_imports=False, stt_enabled=True,
                        openrouter_api_key='synthetic-test-key', stt_model='test-stt-fixture')
    with TestClient(create_app(settings)) as client:
        assert client.get('/api/conversations').json()['items'] == []
        judge_module = llm_switch.get_judge()
        fixture_judge = judge_module.judge
        async def fixture_adapter(conversation, criterion):
            judge_calls.append((conversation.id, criterion.id))
            original_id = aliases.get(conversation.id, conversation.id)
            result = await fixture_judge(conversation.model_copy(update={'id': original_id}), criterion)
            return result.model_copy(update={'model': 'journey-fixture-adapter'}) if original_id != conversation.id else result
        monkeypatch.setattr(judge_module, 'judge', fixture_adapter)

        dev_identities, dev_evaluations = _journey_for_group(client, 'DEV', '', TEMPLATES[0], judge_calls)
        control_identities, _ = _journey_for_group(client, 'CTRL-FIXTURE', 'control-', TEMPLATES[1], judge_calls)
        all_rows = client.get('/api/conversations').json()['items']
        assert len(all_rows) == len({row['number'] for row in all_rows}) == 130
        assert set(dev_identities).isdisjoint(control_identities)
        dev_rows = client.get('/api/conversations', params={'groupId': 'DEV'}).json()['items']
        assert {row['id']: (row['number'], row['startedAt']) for row in dev_rows} == dev_identities
        assert {row['id']: row['lastEvaluation']['id'] for row in dev_rows if row['lastEvaluation']} == dev_evaluations
        assert client.get('/api/appeals?status=decided').json()['counts'] == {'open': 0, 'decided': 2}
        assert len(stt_calls) == 10  # Five synthetic calls per newly imported source, none on duplicate syncs.

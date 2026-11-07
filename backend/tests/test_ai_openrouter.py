"""Real HTTP adapter contract, using only synthetic streamed provider responses."""
import asyncio
import json
from pathlib import Path

import httpx
import pytest

from app.ai import openrouter as ai
from app.checklists import prepare_criterion
from app.errors import JudgeError
from app.models import Conversation, Criterion, JudgeResult
from app.settings import Settings


@pytest.fixture
def source():
    return Conversation.model_validate({'id': 'new-dialogue', 'datasetGroupId': 'DEV',
        'channel': 'agent chat', 'language': 'KZ', 'importedAt': '2026-01-01', 'transcript': [
            {'idx': 2, 'timestamp': '00:00', 'tSec': 0, 'speaker': 'client', 'text': 'Тариф қайда?'},
            {'idx': 7, 'timestamp': '00:01', 'tSec': 1, 'speaker': 'operator',
             'text': 'Сәлеметсіз бе! Менің атым Дана. Тариф кабинетте.'}]})


def criterion(id='custom', type='binary', **values):
    return Criterion(id=id, section_id='main', order=0, title='Дополнительная помощь',
        description='Оператор предложил помощь после ответа.', type=type, weight=5,
        na_allowed=True, **values)


def result(answer='no'):
    return JudgeResult(answer=answer, explanation='Помощь не предложена.', model='synthetic')


def summary():
    return {'topic': 'Поиск тарифа в кабинете', 'request': 'Клиент ищет свой тариф.',
            'outcome': 'Оператор указала кабинет.', 'operatorName': 'Дана'}


def frame(payload):
    return ('data: ' + json.dumps(payload, ensure_ascii=False) + '\n\n').encode()


def events(value, finish='stop', usage=True):
    raw = json.dumps(value, ensure_ascii=False)
    chunks = [frame({'choices': [{'index': 0, 'delta': {'content': raw[pos:pos + 11]}}]})
              for pos in range(0, len(raw), 11)]
    chunks.append(frame({'choices': [{'delta': {}, 'finish_reason': finish}]}))
    if usage:
        chunks.append(frame({'choices': [], 'usage': {'prompt_tokens': 123, 'completion_tokens': 45, 'cost': .0042}}))
    return chunks + [b'data: [DONE]\n\n']


class Stream(httpx.AsyncByteStream):
    def __init__(self, chunks):
        self.chunks, self.closed, self.read = chunks, False, 0

    async def __aiter__(self):
        for chunk in self.chunks:
            self.read += 1
            yield chunk

    async def aclose(self):
        self.closed = True


def install(monkeypatch, value=None, chunks=None, **settings):
    ai.configure(Settings(judge='openrouter', judge_model='test/judge', ai_model='test/ai',
        openrouter_api_key='synthetic-key', stt_enabled=False, **settings))
    calls, streams = [], []
    original = httpx.AsyncClient

    def handle(request):
        body = json.loads(request.content)
        calls.append(body)
        assert str(request.url) == 'https://openrouter.ai/api/v1/chat/completions'
        if body['stream']:
            stream = Stream(chunks if chunks is not None else events(value))
            streams.append(stream)
            return httpx.Response(200, headers={'content-type': 'text/event-stream'}, stream=stream)
        return httpx.Response(200, json={'choices': [{'finish_reason': 'stop',
            'message': {'content': json.dumps(value, ensure_ascii=False)}}],
            'usage': {'prompt_tokens': 123, 'completion_tokens': 45, 'cost': .0042}})

    monkeypatch.setattr(httpx, 'AsyncClient', lambda **kwargs: original(transport=httpx.MockTransport(handle), **kwargs))
    return calls, streams


def test_summary_is_incremental_before_completion_and_uses_configured_model(monkeypatch, source):
    calls, streams = install(monkeypatch, summary())

    async def run():
        stream = ai.summarize_stream(source)
        first = await anext(stream)
        assert first['type'] == 'partial' and first['value']['topic']
        assert streams[0].read < len(streams[0].chunks)
        rest = [event async for event in stream]
        assert rest[-1]['type'] == 'done'
        final = rest[-1]['result']
        assert final.topic == summary()['topic'] and final.operator_name == 'Дана'
        assert final.usage.cost_usd == pytest.approx(.0042) and final.usage.calls == 1
        assert any(event['value'].get('request') for event in rest[:-1])

    asyncio.run(run())
    assert streams[0].closed and len(calls) == 1
    assert calls[0]['model'] == 'test/ai' and calls[0]['stream'] is True
    assert calls[0]['response_format']['json_schema']['strict'] is True
    assert 'untrusted' in calls[0]['messages'][0]['content']


def test_cancellation_closes_provider_stream(monkeypatch, source):
    _, streams = install(monkeypatch, summary())

    async def run():
        stream = ai.summarize_stream(source)
        await anext(stream)
        await stream.aclose()
        await asyncio.sleep(0)

    asyncio.run(run())
    assert streams[0].closed


@pytest.mark.parametrize('change', [
    {'operatorName': 'Выдуманное имя'}, {'topic': 'Тариф'}, {'request': '<script>bad</script>'},
    {'unknown': 'not allowed'}, {'outcome': ''}])
def test_invalid_complete_summary_is_rejected_with_billed_usage(monkeypatch, source, change):
    value = {**summary(), **change}
    calls, _ = install(monkeypatch, value)
    with pytest.raises(JudgeError) as error:
        asyncio.run(ai.summarize(source))
    assert error.value.usage.cost_usd == pytest.approx(.0042)
    assert len(calls) == 1


@pytest.mark.parametrize('chunks', [events(summary(), finish='length'), events(summary(), usage=False),
    events(summary())[:3], [frame({'error': {'message': 'secret upstream details'}})]])
def test_incomplete_or_error_stream_never_yields_done(monkeypatch, source, chunks):
    install(monkeypatch, chunks=chunks)

    async def run():
        received = []
        with pytest.raises(JudgeError) as error:
            async for event in ai.summarize_stream(source):
                received.append(event)
        assert all(event['type'] != 'done' for event in received)
        assert 'secret' not in str(error.value)

    asyncio.run(run())


@pytest.mark.parametrize('payload', [None, [], {'choices': [None]}, {'choices': [{'delta': 'invalid'}]}])
def test_wrong_stream_shapes_fail_safely(monkeypatch, source, payload):
    install(monkeypatch, chunks=[frame(payload)])
    with pytest.raises(JudgeError):
        asyncio.run(ai.summarize(source))


def test_truncated_stream_retains_usage_received_after_finish(monkeypatch, source):
    install(monkeypatch, chunks=events(summary(), finish='length'))
    with pytest.raises(JudgeError) as error:
        asyncio.run(ai.summarize(source))
    assert error.value.usage.cost_usd == pytest.approx(.0042)


def test_coaching_only_weak_binary_and_partial_scale_with_actual_ids(monkeypatch, source):
    items = [(criterion(), result()), (criterion('passed'), result('yes')),
             (criterion('na'), result('na')), (criterion('gross', 'flag'), result('yes')),
             (criterion('scale-new', 'scale', scale=[{'value': 0, 'description': 'Нет'},
                                                    {'value': 3, 'description': 'Полностью'}]), result(1))]
    value = {'tips': [{'criterionId': id, 'tip': 'Предложите дальнейшую помощь.',
                      'example': 'Тағы көмектесе аламын ба?'} for id in ['custom', 'scale-new']]}
    calls, _ = install(monkeypatch, value)
    tips = asyncio.run(ai.coach(source, items))
    assert [tip.criterion_id for tip in tips] == ['custom', 'scale-new']
    assert tips.usage.cost_usd == pytest.approx(.0042)
    payload = json.loads(calls[0]['messages'][1]['content'])
    assert [pair['criterion']['id'] for pair in payload['criteria']] == ['custom', 'scale-new']
    assert payload['conversation']['language'] == 'KZ'


def test_empty_coaching_does_not_call_provider(monkeypatch, source):
    calls, _ = install(monkeypatch)
    tips = asyncio.run(ai.coach(source, [(criterion(), result('yes'))]))
    assert tips == [] and tips.usage.calls == 0 and not calls


@pytest.mark.parametrize('ids', [['foreign'], ['custom', 'custom'], []])
def test_coaching_rejects_unknown_duplicate_or_missing_criteria(monkeypatch, source, ids):
    install(monkeypatch, {'tips': [{'criterionId': id, 'tip': 'Совет.', 'example': 'Мысал.'} for id in ids]})
    with pytest.raises(JudgeError) as error:
        asyncio.run(ai.coach(source, [(criterion(), result())]))
    assert error.value.usage.calls == 1


def test_suggestion_accepts_new_title_without_draft_and_accounts_usage(monkeypatch):
    calls, _ = install(monkeypatch, {'description': 'Да, если предложена помощь.', 'naCondition': None, 'scale': None})
    suggestion = asyncio.run(ai.suggest_criterion('Совершенно новый критерий', '', 'binary'))
    assert suggestion.usage.cost_usd == pytest.approx(.0042)
    assert json.loads(calls[0]['messages'][1]['content'])['title'] == 'Совершенно новый критерий'


def test_suggestion_rejects_duplicate_scale(monkeypatch):
    install(monkeypatch, {'description': 'Правило.', 'naCondition': None,
                         'scale': [{'value': 0, 'description': 'Ноль'}, {'value': 0, 'description': 'Дубль'}]})
    with pytest.raises(JudgeError) as error:
        asyncio.run(ai.suggest_criterion('Шкала', 'Действия оператора', 'scale'))
    assert error.value.usage.calls == 1


@pytest.mark.parametrize('quote,valid', [('Тариф кабинетте.', True), ('Тариф другой.', False)])
def test_second_opinion_checks_exact_original_evidence(monkeypatch, source, quote, valid):
    install(monkeypatch, {'answer': 'yes', 'agreesWithAppeal': True, 'explanation': 'Довод подтверждён.',
        'evidence': [{'turnIdx': 7, 'quote': quote, 'kind': 'supports'}]})
    if valid:
        opinion = asyncio.run(ai.second_opinion(source, criterion(), result(), 'Клиент получил ответ.'))
        assert opinion.agrees_with_appeal and opinion.usage.calls == 1
    else:
        with pytest.raises(JudgeError) as error:
            asyncio.run(ai.second_opinion(source, criterion(), result(), 'Клиент получил ответ.'))
        assert error.value.usage.calls == 1


def test_missing_key_and_model_fail_without_network(source):
    ai.configure(Settings(openrouter_api_key='', ai_model='', judge_model='', stt_enabled=False))
    with pytest.raises(JudgeError, match='не настроен'):
        asyncio.run(ai.summarize(source))


def test_second_opinion_contact_na_exception_matches_judge(monkeypatch, source):
    source.channel = 'voice call'
    source.transcript[0].speaker = 'system'
    source.transcript[0].text = 'Запись началась после соединения.'
    source.transcript[1].text = 'Да, об этом я и говорю.'
    seed = json.loads((Path(__file__).parents[1] / 'app/seed/checklist_v1.json').read_text(encoding='utf-8'))
    contact = Criterion.model_validate(prepare_criterion(next(c for c in seed['criteria'] if c['id'] == 'contact')))
    assert not contact.na_allowed
    calls, _ = install(monkeypatch, {'answer': 'na', 'agreesWithAppeal': True,
        'explanation': 'Начало разговора не попало в запись.',
        'evidence': [{'turnIdx': 2, 'quote': 'Запись началась после соединения.', 'kind': 'supports'}]})
    opinion = asyncio.run(ai.second_opinion(source, contact, result(), 'Начало разговора не записано.'))
    assert opinion.answer == 'na'
    assert 'na' in calls[0]['response_format']['json_schema']['schema']['properties']['answer']['enum']
    assert json.loads(calls[0]['messages'][1]['content'])['contactNaAllowed'] is True


def test_cache_identity_changes_with_model_and_prompt(monkeypatch, tmp_path):
    ai.configure(Settings(ai_model='test/one', stt_enabled=False))
    first = ai.cache_identity()
    ai.configure(Settings(ai_model='test/two', stt_enabled=False))
    assert first != ai.cache_identity()
    (tmp_path / 'system.md').write_text('changed prompt', encoding='utf-8')
    monkeypatch.setattr(ai, '_PROMPTS', tmp_path)
    assert first != ai.cache_identity()

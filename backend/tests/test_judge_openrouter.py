"""Mocked OpenRouter boundary tests; no provider credentials or network calls."""
import asyncio
import copy
import json
from pathlib import Path

import httpx
import pytest

from app.checklists import prepare_criterion
from app.errors import ApiError, JudgeError
from app.models import Conversation, Criterion
from app.settings import Settings


@pytest.fixture
def source():
    return Conversation.model_validate({
        'id': 'synthetic', 'datasetGroupId': 'DEV', 'channel': 'agent chat', 'language': 'RU',
        'importedAt': '2026-01-01T00:00:00Z',
        'transcript': [
            {'idx': 0, 'timestamp': '00:00', 'tSec': 0, 'speaker': 'client', 'text': 'Где найти тариф?'},
            {'idx': 1, 'timestamp': '00:05', 'tSec': 5, 'speaker': 'operator',
             'text': 'Здравствуйте, я [Имя скрыто]. Тариф указан в кабинете.'},
            {'idx': 2, 'timestamp': '00:07', 'tSec': 7, 'speaker': 'client', 'text': 'Спасибо, нашёл.'},
            {'idx': 3, 'timestamp': '00:09', 'tSec': 9, 'speaker': 'operator', 'text': 'Могу помочь ещё? До свидания!'},
        ],
    })


@pytest.fixture
def criteria():
    body = json.loads((Path(__file__).parents[1] / 'app/seed/checklist_v1.json').read_text(encoding='utf-8'))
    return {c['id']: Criterion.model_validate(prepare_criterion(c)) for c in body['criteria']}


def verdict(answer='yes', confidence='high', **changes):
    result = {'answer': answer, 'explanation': 'Оператор выполнил требуемое действие.',
              'evidence': [{'turn_idx': 1, 'quote': 'Здравствуйте, я [Имя скрыто].', 'kind': 'supports'}],
              'checked_range': None, 'na_reason': None, 'flag_types': None, 'confidence': confidence}
    result.update(changes)
    return result


def install(monkeypatch, responses, **settings_changes):
    from app.judge import openrouter
    config = Settings(judge='openrouter', judge_model='test/configured-model', openrouter_api_key='synthetic-key',
                      auto_summarize=False, stt_enabled=False, **settings_changes)
    openrouter.configure(config)
    calls = []
    original = httpx.AsyncClient

    def handle(request):
        body = json.loads(request.content)
        calls.append(body)
        assert str(request.url) == 'https://openrouter.ai/api/v1/chat/completions'
        assert request.headers['Authorization'] == 'Bearer synthetic-key'
        response = responses[min(len(calls) - 1, len(responses) - 1)]
        if isinstance(response, Exception):
            raise response
        if callable(response):
            return response(request, body)
        content = json.dumps(response)
        message = ({'content': content} if 'response_format' in body else
                   {'tool_calls': [{'id': 'synthetic-call', 'type': 'function',
                                    'function': {'name': 'submit_verdict', 'arguments': content}}]})
        return httpx.Response(200, json={'model': 'test/actual-model',
            'choices': [{'finish_reason': 'stop' if 'response_format' in body else 'tool_calls', 'message': message}],
            'usage': {'prompt_tokens': 120, 'completion_tokens': 40, 'cost': .003}})

    monkeypatch.setattr(httpx, 'AsyncClient', lambda **kwargs: original(transport=httpx.MockTransport(handle), **kwargs))
    return openrouter, config, calls


def test_forced_tool_parses_dynamic_rule_and_actual_usage(monkeypatch, source, criteria):
    adapter, config, calls = install(monkeypatch, [verdict()])
    result = asyncio.run(adapter.judge(source, criteria['contact']))
    assert result.answer == 'yes' and result.model == 'test/actual-model'
    assert result.usage.cost_usd == pytest.approx(.003) and result.usage.calls == 1
    assert not result.needs_review
    body, = calls
    assert body['model'] == 'test/configured-model' and body['temperature'] == 0
    assert body['tool_choice'] == {'type': 'function', 'function': {'name': 'submit_verdict'}}
    assert body['tools'][0]['function']['parameters']['additionalProperties'] is False
    assert source.transcript[1].text in body['messages'][1]['content']
    assert criteria['contact'].description in body['messages'][1]['content']


def test_invalid_quote_retries_once_with_error_and_sums_both_charges(monkeypatch, source, criteria):
    wrong = verdict(evidence=[{'turn_idx': 1, 'quote': 'Цитата выдумана', 'kind': 'supports'}])
    adapter, config, calls = install(monkeypatch, [wrong, verdict()])
    result = asyncio.run(adapter.judge(source, criteria['contact']))
    assert len(calls) == 2 and result.usage.calls == 2
    assert result.usage.cost_usd == pytest.approx(.006)
    assert 'Цитата модели не найдена' in calls[1]['messages'][-1]['content']
    assert calls[0]['temperature'] == calls[1]['temperature'] == 0


def test_repeated_invalid_answer_fails_with_usage_and_safe_message(monkeypatch, source, criteria):
    adapter, config, calls = install(monkeypatch, [verdict(answer=123)])
    with pytest.raises(JudgeError) as failure:
        asyncio.run(adapter.judge(source, criteria['contact']))
    assert len(calls) == 2 and failure.value.usage.calls == 2
    assert failure.value.usage.cost_usd == pytest.approx(.006)
    assert 'synthetic-key' not in str(failure.value) and 'Повторите' in str(failure.value)


@pytest.mark.parametrize('criterion_id,first,second,review,calls_expected', [
    ('contact', verdict(confidence='low'), None, True, 1),
    ('contact', verdict(), None, False, 1),
    ('contact', verdict('no', checked_range=[0, 3], evidence=[{'turn_idx': 1, 'quote': 'Здравствуйте', 'kind': 'expected_here'}]), verdict(), True, 2),
    ('empathy', verdict('no'), None, False, 1),
    ('consultation', verdict(20), verdict(15), True, 2),
    ('consultation', verdict(20), verdict(20), False, 2),
    ('dialogue', verdict(10), verdict(10, confidence='low'), True, 2),
])
def test_only_required_uncertainty_checks_run(monkeypatch, source, criteria, criterion_id, first, second, review, calls_expected):
    adapter, config, calls = install(monkeypatch, [first, second or first])
    result = asyncio.run(adapter.judge(source, criteria[criterion_id]))
    assert result.answer == first['answer'] and result.needs_review is review
    assert len(calls) == calls_expected and result.usage.calls == calls_expected
    if calls_expected == 2:
        assert calls[1]['temperature'] == .3
        assert 'предыдущ' not in calls[1]['messages'][1]['content'].lower()


def test_new_criterion_uses_its_rule_without_original_clarification(monkeypatch, source, criteria):
    new = criteria['contact'].model_dump(by_alias=True)
    new.update(id='extra-help', title='Дополнительная помощь', description='Да, если предложена дополнительная помощь.')
    new = Criterion.model_validate(prepare_criterion(new))
    adapter, config, calls = install(monkeypatch, [verdict(evidence=[{'turn_idx': 3, 'quote': 'Могу помочь ещё?', 'kind': 'supports'}])])
    result = asyncio.run(adapter.judge(source, new))
    assert result.answer == 'yes'
    sent = json.loads(calls[0]['messages'][1]['content'])
    assert sent['criterion']['description'] == new.description
    assert not sent['originalCriterionClarification']


@pytest.mark.parametrize('problem', ['bad_tool', 'truncated', 'missing_cost', 'negative_cost', 'nan_cost', 'bad_json'])
def test_malformed_provider_response_never_becomes_success(monkeypatch, source, criteria, problem):
    def response(request, body):
        payload = {'model': 'test/actual-model', 'usage': {'prompt_tokens': 1, 'completion_tokens': 2, 'cost': .003},
                   'choices': [{'finish_reason': 'tool_calls', 'message': {'tool_calls': [
                       {'type': 'function', 'function': {'name': 'submit_verdict', 'arguments': json.dumps(verdict())}}]}}]}
        if problem == 'bad_tool':
            payload['choices'][0]['message']['tool_calls'][0]['function']['name'] = 'run_shell'
        elif problem == 'truncated':
            payload['choices'][0]['finish_reason'] = 'length'
        elif problem == 'missing_cost':
            del payload['usage']['cost']
        elif problem in ('negative_cost', 'nan_cost'):
            payload['usage']['cost'] = -.01 if problem == 'negative_cost' else 'NaN'
        elif problem == 'bad_json':
            payload['choices'][0]['message']['tool_calls'][0]['function']['arguments'] = '{'
        return httpx.Response(200, json=payload)
    adapter, config, calls = install(monkeypatch, [response])
    with pytest.raises(JudgeError):
        asyncio.run(adapter.judge(source, criteria['contact']))
    assert len(calls) <= 2


def test_http_failure_is_safe_and_has_no_automatic_paid_retry(monkeypatch, source, criteria):
    adapter, config, calls = install(monkeypatch, [lambda request, body: httpx.Response(429, text='private body synthetic-key')])
    with pytest.raises(JudgeError) as failure:
        asyncio.run(adapter.judge(source, criteria['contact']))
    assert len(calls) == 1
    assert 'private' not in str(failure.value) and 'synthetic-key' not in str(failure.value)


def test_missing_configuration_never_calls_provider(monkeypatch, source, criteria):
    adapter, config, calls = install(monkeypatch, [verdict()])
    config.judge_model = ''
    with pytest.raises(JudgeError, match='настро'):
        asyncio.run(adapter.judge(source, criteria['contact']))
    assert calls == []


def test_schema_probe_mode_has_same_validated_contract(monkeypatch, source, criteria):
    adapter, config, calls = install(monkeypatch, [verdict()], judge_output_mode='schema')
    result = asyncio.run(adapter.judge(source, criteria['contact']))
    assert result.answer == 'yes' and result.usage.calls == 1
    assert 'tools' not in calls[0]
    assert calls[0]['response_format']['json_schema']['strict'] is True


@pytest.mark.parametrize('shape', ['null_choice', 'string_choice', 'null_tool', 'string_function'])
def test_wrong_nested_shapes_retry_safely_and_preserve_billing(monkeypatch, source, criteria, shape):
    def response(request, body):
        choice = {'finish_reason': 'tool_calls', 'message': {'tool_calls': [
            {'type': 'function', 'function': {'name': 'submit_verdict', 'arguments': json.dumps(verdict())}}]}}
        if shape == 'null_choice':
            choice = None
        elif shape == 'string_choice':
            choice = 'invalid'
        elif shape == 'null_tool':
            choice['message']['tool_calls'] = [None]
        else:
            choice['message']['tool_calls'][0]['function'] = 'invalid'
        return httpx.Response(200, json={'model': 'test/actual-model', 'choices': [choice],
                                        'usage': {'prompt_tokens': 1, 'completion_tokens': 1, 'cost': .003}})
    adapter, config, calls = install(monkeypatch, [response])
    with pytest.raises(JudgeError) as failure:
        asyncio.run(adapter.judge(source, criteria['contact']))
    assert len(calls) == 2 and failure.value.usage.cost_usd == pytest.approx(.006)


def test_original_clarifications_follow_content_not_id_or_weight(criteria):
    from app.judge.hints import criterion_clarification
    original = criteria['contact']
    assert criterion_clarification(original)
    weighted = original.model_dump(by_alias=True)
    weighted['weight'] += 4
    assert criterion_clarification(Criterion.model_validate(prepare_criterion(weighted)))
    changed = original.model_copy(update={'description': 'Да, если клиент поздоровался.'})
    assert not criterion_clarification(changed)  # Even a stale original contentHash cannot revive instructions.
    changed = Criterion.model_validate(prepare_criterion(changed.model_dump(by_alias=True)))
    assert not criterion_clarification(changed)


@pytest.mark.parametrize('text', ['Личность клиента подтверждена.', 'Клиенттің жеке басы расталды.',
                                'Customer identity has been verified.'])
def test_identity_hint_accepts_only_actual_system_confirmation(source, text):
    from app.judge.hints import build_hints
    turn = source.transcript[0]
    turn.text, turn.speaker = text, 'system'
    assert build_hints(source)['identityConfirmationIdxs'] == [0]
    turn.speaker = 'bot'
    assert not build_hints(source)['identityConfirmed']
    turn.speaker, turn.text = 'system', 'Личность клиента не подтверждена.'
    assert not build_hints(source)['identityConfirmed']


def late_recording_source(source):
    source = source.model_copy(deep=True)
    source.channel = 'voice call'
    source.transcript[0].speaker = 'system'
    source.transcript[0].text = 'Запись началась после соединения.'
    source.transcript[1].text = 'Да, об этом я и говорю.'
    return source


def test_contact_na_exception_is_consistent_in_schema_validator_and_scoring(monkeypatch, source, criteria):
    from app.evaluations import validate_judge_result
    from app.judge.hints import contact_na_allowed
    from app.scoring import validate_answer
    source = late_recording_source(source)
    adapter, config, calls = install(monkeypatch, [verdict('na', na_reason='Приветствие не попало в запись.',
        evidence=[{'turn_idx': 0, 'quote': 'Запись началась после соединения.', 'kind': 'supports'}])])
    result = asyncio.run(adapter.judge(source, criteria['contact']))
    criterion_dict = criteria['contact'].model_dump(by_alias=True)
    source_dict = source.model_dump(by_alias=True)
    validate_answer(criterion_dict, 'na', source_dict)
    validate_judge_result(result, criterion_dict, source_dict)
    assert result.answer == 'na' and contact_na_allowed(source_dict, criterion_dict)
    assert 'na' in calls[0]['tools'][0]['function']['parameters']['properties']['answer']['enum']
    assert json.loads(calls[0]['messages'][1]['content'])['contactNaAllowed'] is True
    with pytest.raises(ApiError):
        validate_answer(criterion_dict, 'na')
    source.channel = 'agent chat'
    with pytest.raises(ApiError):
        validate_answer(criterion_dict, 'na', source.model_dump(by_alias=True))
    source.channel = 'voice call'
    changed = dict(criterion_dict, description='Да, если оператор отвечает на вопрос.')
    with pytest.raises(ApiError):
        validate_answer(changed, 'na', source.model_dump(by_alias=True))


def test_later_recording_event_does_not_excuse_first_operator_turn(source, criteria):
    from app.judge.hints import build_hints, contact_na_allowed
    source = late_recording_source(source)
    source.transcript[0].text = 'Агент присоединился к разговору с клиентом.'
    source.transcript[2].speaker = 'system'
    source.transcript[2].text = 'Запись началась.'
    assert not build_hints(source)['midRecordingCall']
    assert not contact_na_allowed(source, criteria['contact'])


def test_pause_hints_do_not_count_bot_as_operator_or_reset_unanswered_client(source):
    from app.judge.hints import build_hints
    source.transcript[1].speaker = 'bot'
    source.transcript[2].t_sec = 6
    hint = build_hints(source)
    assert hint['firstOperatorIdx'] == 3
    assert hint['longestClientOperatorPause'] == {'clientIdx': 0, 'operatorIdx': 3, 'seconds': 9}


def _install_queue_provider(seeded_client, monkeypatch, broken_contact=False):
    from app import llm_switch

    def response(request, body):
        sent = json.loads(body['messages'][1]['content'])
        criterion = sent['criterion']
        operator = next(t for t in sent['conversation']['transcript'] if t['speaker'] == 'operator')
        answer = (max(s['value'] for s in criterion['scale']) if criterion['type'] == 'scale'
                  else 'no' if criterion['type'] == 'flag' else 'yes')
        result = verdict(answer, evidence=[{'turn_idx': operator['idx'], 'quote': operator['text'][:80], 'kind': 'supports'}])
        if broken_contact and criterion['id'] == 'contact':
            result['evidence'][0]['quote'] = 'Этой строки нет в исходном диалоге.'
        return httpx.Response(200, json={'model': 'test/actual-model',
            'choices': [{'finish_reason': 'tool_calls', 'message': {'tool_calls': [
                {'type': 'function', 'function': {'name': 'submit_verdict', 'arguments': json.dumps(result)}}]}}],
            'usage': {'prompt_tokens': 10, 'completion_tokens': 5, 'cost': .003}})
    adapter, config, calls = install(monkeypatch, [response])
    monkeypatch.setenv('JUDGE', 'openrouter')
    app_settings = seeded_client.app.state.settings
    for field in ('judge', 'judge_model', 'judge_temperature', 'judge_output_mode', 'openrouter_api_key'):
        setattr(app_settings, field, getattr(config, field))
    llm_switch.configure('openrouter', app_settings)
    return adapter, app_settings, calls


def test_failed_criterion_keeps_all_billed_attempts_in_evaluation_and_health(seeded_client, monkeypatch):
    from tests.helpers import evaluate
    adapter, config, calls = _install_queue_provider(seeded_client, monkeypatch, broken_contact=True)
    result, = evaluate(seeded_client)
    assert result['status'] == 'failed' and result['total'] is None
    failed = next(item for item in result['items'] if item['criterionId'] == 'contact')
    assert failed['status'] == 'failed' and failed['usage']['calls'] == 2
    assert failed['usage']['costUsd'] == pytest.approx(.006)
    assert failed['model'] == 'test/actual-model'
    assert result['usage']['calls'] == len(calls) == 11
    assert result['usage']['costUsd'] == pytest.approx(.033)
    with seeded_client.app.state.db.transaction() as conn:
        cost, count = conn.execute("SELECT SUM(cost_usd),SUM(calls) FROM model_calls WHERE kind='evaluation'").fetchone()
    assert cost == pytest.approx(.033) and count == 11


def test_real_judge_never_reuses_fake_and_preserves_item_model_on_valid_reuse(seeded_client, monkeypatch):
    from tests.helpers import evaluate
    fake, = evaluate(seeded_client)
    assert fake['model'] == 'fake'
    adapter, config, calls = _install_queue_provider(seeded_client, monkeypatch)
    real, = evaluate(seeded_client, reuse=True)
    assert real['status'] == 'done' and len(calls) == 10
    assert all(not item['reused'] and item['model'] == 'test/actual-model' for item in real['items'])
    cached, = evaluate(seeded_client, reuse=True)
    assert len(calls) == 10 and cached['usage']['calls'] == 0
    assert all(item['reused'] and item['model'] == 'test/actual-model' for item in cached['items'])
    config.judge_model = 'test/other-configured-model'
    changed, = evaluate(seeded_client, reuse=True)
    assert len(calls) == 20 and all(not item['reused'] for item in changed['items'])


def _delay_mock_requests(monkeypatch, delay):
    """Delay the mocked transport without sending a request outside the test."""
    factory = httpx.AsyncClient
    started, cancelled, deadlines = [], [], []

    class DelayedClient:
        def __init__(self, **kwargs):
            deadlines.append(kwargs['timeout'].read)
            self.client = factory(**kwargs)

        async def __aenter__(self):
            await self.client.__aenter__()
            return self

        async def __aexit__(self, *args):
            return await self.client.__aexit__(*args)

        async def post(self, *args, **kwargs):
            started.append(True)
            try:
                await asyncio.sleep(delay)
                return await self.client.post(*args, **kwargs)
            except asyncio.CancelledError:
                cancelled.append(True)
                raise

    monkeypatch.setattr(httpx, 'AsyncClient', DelayedClient)
    return started, cancelled, deadlines


def test_request_can_use_more_than_one_quarter_of_the_operation_budget(monkeypatch, source, criteria):
    adapter, config, calls = install(monkeypatch, [verdict()], model_timeout=.4)
    started, cancelled, deadlines = _delay_mock_requests(monkeypatch, .12)
    result = asyncio.run(adapter.judge(source, criteria['contact']))
    assert result.answer == 'yes' and result.usage.calls == 1
    assert len(calls) == len(started) == 1 and not cancelled
    assert .3 < deadlines[0] < config.model_timeout


def test_shared_deadline_cancels_later_check_and_preserves_prior_usage(monkeypatch, source, criteria):
    adapter, config, calls = install(monkeypatch, [verdict(20)], model_timeout=.3)
    started, cancelled, deadlines = _delay_mock_requests(monkeypatch, .18)
    with pytest.raises(JudgeError, match='время ожидания') as failure:
        asyncio.run(adapter.judge(source, criteria['consultation']))
    assert len(started) == 2 and len(cancelled) == 1
    assert len(calls) == 1  # The incomplete request has no returned usage to invent.
    assert 0 < deadlines[1] < deadlines[0] - .12
    assert failure.value.usage.calls == 1 and failure.value.usage.cost_usd == pytest.approx(.003)
    assert failure.value.model == 'test/actual-model'
    assert not hasattr(failure.value, 'status_code') and not hasattr(failure.value, 'response')


@pytest.mark.parametrize('status', [400, 401, 429, 503])
def test_http_status_is_safe_and_queue_does_not_retry_transport(monkeypatch, source, criteria, status):
    from app.evaluations import EvaluationQueue
    adapter, config, calls = install(monkeypatch, [
        lambda request, body: httpx.Response(status, text='private body synthetic-key')])
    queue = EvaluationQueue(None, config)
    with pytest.raises(JudgeError, match=f'HTTP {status}') as failure:
        asyncio.run(queue._invoke_with_retries(adapter.judge, (source, criteria['contact']), {}))
    assert len(calls) == 1 and failure.value.usage.calls == 0
    assert 'private' not in str(failure.value) and 'synthetic-key' not in str(failure.value)


@pytest.mark.parametrize('failure,expected', [
    (httpx.ReadTimeout('private timeout synthetic-key'), 'время ожидания'),
    (httpx.ConnectError('private connection synthetic-key'), 'Сбой соединения'),
    (asyncio.TimeoutError('private deadline synthetic-key'), 'время ожидания'),
])
def test_transport_failure_categories_are_distinct_and_safe(monkeypatch, source, criteria, failure, expected):
    adapter, config, calls = install(monkeypatch, [failure])
    with pytest.raises(JudgeError, match=expected) as caught:
        asyncio.run(adapter.judge(source, criteria['contact']))
    assert len(calls) == 1 and caught.value.usage.calls == 0
    assert 'private' not in str(caught.value) and 'synthetic-key' not in str(caught.value)


def test_http_failure_after_paid_primary_keeps_its_usage(monkeypatch, source, criteria):
    adapter, config, calls = install(monkeypatch, [verdict(20),
        lambda request, body: httpx.Response(503, text='private body synthetic-key')])
    with pytest.raises(JudgeError, match='HTTP 503') as failure:
        asyncio.run(adapter.judge(source, criteria['consultation']))
    assert len(calls) == 2
    assert failure.value.usage.calls == 1 and failure.value.usage.cost_usd == pytest.approx(.003)
    assert failure.value.model == 'test/actual-model'


@pytest.mark.parametrize('timeout', [0, -1, float('inf'), float('nan')])
def test_nonpositive_or_unbounded_timeout_cannot_send_request(monkeypatch, source, criteria, timeout):
    adapter, config, calls = install(monkeypatch, [verdict()], model_timeout=timeout)
    with pytest.raises(JudgeError, match='Время ожидания'):
        asyncio.run(adapter.judge(source, criteria['contact']))
    assert calls == []

"""Mocked Gemini batch boundary; no provider credentials or live requests."""
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


def verdict(answer='yes', **changes):
    result = {'answer': answer, 'explanation': 'Оператор выполнил требуемое действие.',
              'evidence': [{'turn_idx': 1, 'quote': 'Здравствуйте, я [Имя скрыто].', 'kind': 'supports'}],
              'checked_range': None, 'na_reason': None, 'flag_types': None, 'support_status': 'supported'}
    result.update(changes)
    return result


def wire_response(results, **changes):
    content = results if isinstance(results, str) else json.dumps({'results': results})
    payload = {'model': 'test/actual-model',
               'choices': [{'finish_reason': 'stop', 'message': {'content': content}}],
               'usage': {'prompt_tokens': 120, 'completion_tokens': 40, 'cost': .003}}
    payload.update(changes)
    return payload


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
        ids = body['response_format']['json_schema']['schema']['properties']['results']['required']
        results = {cid: response for cid in ids} if 'answer' in response else response
        return httpx.Response(200, json=wire_response(results))

    monkeypatch.setattr(httpx, 'AsyncClient', lambda **kwargs: original(transport=httpx.MockTransport(handle), **kwargs))
    return openrouter, config, calls


def test_one_schema_request_returns_shared_receipt_and_zero_item_charges(monkeypatch, source, criteria):
    adapter, config, calls = install(monkeypatch, [{'contact': verdict(), 'closing': verdict()}])
    batch = asyncio.run(adapter.judge_batch(source, [criteria['contact'], criteria['closing']]))
    assert set(batch.results) == {'contact', 'closing'} and not batch.errors
    assert batch.model == 'test/actual-model' and batch.usage_known and batch.request_sent
    assert batch.usage.calls == 1 and batch.usage.cost_usd == pytest.approx(.003)
    assert all(result.usage.calls == result.latency_ms == 0 for result in batch.results.values())
    body, = calls
    assert body['model'] == 'test/configured-model' and body['temperature'] == 0
    assert body['reasoning'] == {'effort': 'low'} and body['max_tokens'] == 8192
    assert body['provider'] == {'only': ['google-ai-studio'], 'allow_fallbacks': False, 'require_parameters': True}
    assert 'tools' not in body and body['response_format']['json_schema']['strict'] is True
    sent = json.loads(body['messages'][1]['content'])
    assert set(sent['questions']) == {'contact', 'closing'}
    assert source.transcript[1].text in body['messages'][1]['content']
    assert criteria['contact'].description in sent['questions']['contact']['instructions']


def test_single_trial_uses_same_batch_contract_and_full_receipt(monkeypatch, source, criteria):
    adapter, config, calls = install(monkeypatch, [verdict()])
    result = asyncio.run(adapter.judge(source, criteria['contact']))
    assert result.answer == 'yes' and result.usage.calls == 1
    assert result.usage.cost_usd == pytest.approx(.003) and result.model == 'test/actual-model'
    assert not result.needs_review
    assert calls[0]['response_format']['json_schema']['schema']['properties']['results']['required'] == ['contact']


def test_bad_quote_keeps_other_valid_results_without_repair_or_second_charge(monkeypatch, source, criteria):
    wrong = verdict(evidence=[{'turn_idx': 1, 'quote': 'Выдуманная цитата', 'kind': 'supports'}])
    adapter, config, calls = install(monkeypatch, [{'contact': wrong, 'closing': verdict()}])
    batch = asyncio.run(adapter.judge_batch(source, [criteria['contact'], criteria['closing']]))
    assert list(batch.results) == ['closing'] and list(batch.errors) == ['contact']
    assert 'Цитата модели не найдена' in batch.errors['contact']
    assert batch.diagnostics['contact']['answer'] == 'yes'
    assert batch.usage.calls == len(calls) == 1 and batch.usage.cost_usd == pytest.approx(.003)


@pytest.mark.parametrize('criterion_id,result', [
    ('contact', verdict(answer=True)),
    ('contact', verdict(answer=123)),
    ('contact', verdict(evidence=[])),
    ('contact', verdict(evidence=[{'turn_idx': 1, 'quote': ' ', 'kind': 'supports'}])),
    ('contact', verdict(explanation=' ')),
    ('contact', verdict(evidence=[{'turn_idx': 9, 'quote': 'Здравствуйте', 'kind': 'supports'}])),
    ('contact', verdict('no')),
    ('contact', verdict('no', checked_range=[0, 0], evidence=[{'turn_idx': 1, 'quote': 'Здравствуйте', 'kind': 'expected_here'}])),
    ('contact', verdict('no', checked_range=[3, 0])),
    ('contact', verdict('no', checked_range=[0, 5])),
    ('contact', verdict('na', na_reason='Не применимо')),
    ('needs', verdict('na')),
    ('contact', verdict(na_reason='Лишнее поле')),
    ('contact', verdict(flag_types=[])),
    ('gross', verdict('yes')),
    ('gross', verdict('yes', flag_types=['invented-flag'])),
    ('gross', verdict('no', checked_range=[0, 3], flag_types=['invented-flag'])),
    ('contact', {**verdict(), 'confidence': 'high'}),
])
def test_formal_and_domain_failures_are_not_scored(monkeypatch, source, criteria, criterion_id, result):
    adapter, config, calls = install(monkeypatch, [result])
    with pytest.raises(JudgeError) as failure:
        asyncio.run(adapter.judge(source, criteria[criterion_id]))
    assert failure.value.usage.calls == 1 and failure.value.usage_known
    assert failure.value.request_sent and len(calls) == 1
    assert 'synthetic-key' not in str(failure.value)


@pytest.mark.parametrize('support', ['unsupported', 'insufficient'])
def test_unsubstantiated_answer_is_diagnostic_failure_with_original_explanation(monkeypatch, source, criteria, support):
    raw = verdict(support_status=support, evidence=[], explanation='В разговоре недостаточно данных для обоснования.')
    adapter, config, calls = install(monkeypatch, [raw])
    batch = asyncio.run(adapter.judge_batch(source, [criteria['contact']]))
    assert not batch.results and raw['explanation'] in batch.errors['contact']
    assert batch.diagnostics == {'contact': {'answer': 'yes', 'supportStatus': support, 'explanation': raw['explanation']}}
    assert batch.usage.calls == len(calls) == 1


def test_supported_negative_and_flag_results_require_real_ranges(monkeypatch, source, criteria):
    adapter, config, calls = install(monkeypatch, [{
        'contact': verdict('no', checked_range=[0, 3],
                           evidence=[{'turn_idx': 1, 'quote': 'Здравствуйте', 'kind': 'expected_here'}]),
        'gross': verdict('no', checked_range=[0, 3]),
        'consultation': verdict(20),
    }])
    batch = asyncio.run(adapter.judge_batch(source, [criteria[cid] for cid in ['contact', 'gross', 'consultation']]))
    assert not batch.errors and len(batch.results) == 3
    assert batch.usage.calls == len(calls) == 1  # No independent checker for scales/no.


def test_missing_result_only_fails_that_criterion(monkeypatch, source, criteria):
    adapter, config, calls = install(monkeypatch, [{'contact': verdict()}])
    batch = asyncio.run(adapter.judge_batch(source, [criteria['contact'], criteria['closing']]))
    assert set(batch.results) == {'contact'} and set(batch.errors) == {'closing'}
    assert batch.usage.calls == len(calls) == 1


def test_dynamic_custom_roster_and_fractional_scale_have_no_eight_rule_assumption(monkeypatch, source, criteria):
    rules = []
    for index in range(9):
        rule = criteria['contact'].model_dump(by_alias=True)
        rule.update(id=f'custom-{index}', title=f'Правило {index}', description='Да, если предложена помощь.')
        rules.append(Criterion.model_validate(prepare_criterion(rule)))
    adapter, config, calls = install(monkeypatch, [verdict()])
    batch = asyncio.run(adapter.judge_batch(source, rules))
    assert len(batch.results) == 9 and len(calls) == 1
    sent = json.loads(calls[0]['messages'][1]['content'])
    assert set(sent['questions']) == {rule.id for rule in rules}
    assert all('Уточнение именно' not in question['instructions'] for question in sent['questions'].values())
    rule = rules[0].model_dump(by_alias=True)
    rule.update(type='scale', scale=[{'value': 0, 'description': 'Не выполнено'},
                                    {'value': .25, 'description': 'Частично'}, {'value': 1.5, 'description': 'Полностью'}])
    rule = Criterion.model_validate(prepare_criterion(rule))
    schema = adapter.verdict_schema(source, rule)
    assert set(schema['properties']['answer']['enum']) == {0, .25, 1.5}
    assert set(adapter._choice_labels(source, rule).values()) == {0, .25, 1.5}


def test_original_clarifications_follow_full_content_not_id_or_weight(criteria):
    from app.judge import openrouter as adapter
    original = criteria['contact']
    assert adapter._clarification(original)
    weighted = original.model_dump(by_alias=True)
    weighted['weight'] += 4
    assert adapter._clarification(Criterion.model_validate(prepare_criterion(weighted)))
    changed = original.model_copy(update={'description': 'Да, если клиент поздоровался.'})
    assert not adapter._clarification(changed)
    assert not adapter._clarification(Criterion.model_validate(prepare_criterion(changed.model_dump(by_alias=True))))


def late_recording_source(source):
    source = source.model_copy(deep=True)
    source.channel = 'voice call'
    source.transcript[0].speaker = 'system'
    source.transcript[0].text = 'Запись началась после соединения.'
    source.transcript[1].text = 'Да, об этом я и говорю.'
    return source


def test_contact_na_guard_matches_schema_validation_and_current_rule(monkeypatch, source, criteria):
    from app.evaluations import validate_judge_result
    from app.judge.hints import contact_na_allowed
    from app.scoring import validate_answer
    source = late_recording_source(source)
    adapter, config, calls = install(monkeypatch, [verdict('na', na_reason='Приветствие не попало в запись.',
        evidence=[{'turn_idx': 0, 'quote': 'Запись началась после соединения.', 'kind': 'supports'}])])
    result = asyncio.run(adapter.judge(source, criteria['contact']))
    rule, conversation = criteria['contact'].model_dump(by_alias=True), source.model_dump(by_alias=True)
    validate_answer(rule, 'na', conversation)
    validate_judge_result(result, rule, conversation)
    assert contact_na_allowed(conversation, rule)
    schema = calls[0]['response_format']['json_schema']['schema']['properties']['results']['properties']['contact']
    assert 'na' in schema['properties']['answer']['enum']
    assert 'contactNaAllowed=true' in json.loads(calls[0]['messages'][1]['content'])['questions']['contact']['instructions']
    with pytest.raises(ApiError):
        validate_answer(rule, 'na')
    with pytest.raises(ApiError):
        validate_answer({**rule, 'description': 'Да, если оператор отвечает на вопрос.'}, 'na', conversation)
    source.channel = 'agent chat'
    assert not contact_na_allowed(source, criteria['contact'])


@pytest.mark.parametrize('text', ['Личность клиента подтверждена.', 'Клиенттің жеке басы расталды.',
                                'Customer identity has been verified.'])
def test_identity_hint_only_uses_actual_system_confirmation(source, text):
    from app.judge.hints import build_hints
    turn = source.transcript[0]
    turn.text, turn.speaker = text, 'system'
    assert build_hints(source)['identityConfirmationIdxs'] == [0]
    turn.speaker = 'bot'
    assert not build_hints(source)['identityConfirmed']
    turn.speaker, turn.text = 'system', 'Личность клиента не подтверждена.'
    assert not build_hints(source)['identityConfirmed']


def test_later_recording_and_bot_reply_do_not_change_contextual_hints(source, criteria):
    from app.judge.hints import build_hints, contact_na_allowed
    late = late_recording_source(source)
    late.transcript[0].text = 'Агент присоединился к разговору с клиентом.'
    late.transcript[2].speaker, late.transcript[2].text = 'system', 'Запись началась.'
    assert not build_hints(late)['midRecordingCall'] and not contact_na_allowed(late, criteria['contact'])
    source.transcript[1].speaker = 'bot'
    source.transcript[2].t_sec = 6
    hint = build_hints(source)
    assert hint['firstOperatorIdx'] == 3
    assert hint['longestClientOperatorPause'] == {'clientIdx': 0, 'operatorIdx': 3, 'seconds': 9}


@pytest.mark.parametrize('problem,known', [
    ('bad_json', True), ('null_choice', True), ('null_message', True), ('unexpected_id', True),
    ('extra_envelope_key', True), ('duplicate_key', True), ('missing_model', True),
    ('missing_cost', False), ('negative_cost', False), ('nan_cost', False), ('bool_tokens', False),
])
def test_malformed_wire_never_succeeds_and_keeps_known_billing(monkeypatch, source, criteria, problem, known):
    def response(request, body):
        payload = wire_response({'contact': verdict()})
        if problem == 'bad_json':
            payload['choices'][0]['message']['content'] = '{'
        elif problem == 'null_choice':
            payload['choices'] = [None]
        elif problem == 'null_message':
            payload['choices'][0]['message'] = None
        elif problem == 'unexpected_id':
            payload = wire_response({'not-requested': verdict()})
        elif problem == 'extra_envelope_key':
            payload['choices'][0]['message']['content'] = json.dumps({'results': {'contact': verdict()}, 'extra': 1})
        elif problem == 'duplicate_key':
            payload['choices'][0]['message']['content'] = '{"results":{"contact":{},"contact":{}}}'
        elif problem == 'missing_model':
            del payload['model']
        elif problem == 'missing_cost':
            del payload['usage']['cost']
        elif problem in {'negative_cost', 'nan_cost'}:
            payload['usage']['cost'] = -.01 if problem == 'negative_cost' else 'NaN'
        elif problem == 'bool_tokens':
            payload['usage']['prompt_tokens'] = True
        return httpx.Response(200, json=payload)
    adapter, config, calls = install(monkeypatch, [response])
    with pytest.raises(JudgeError) as caught:
        asyncio.run(adapter.judge_batch(source, [criteria['contact']]))
    assert len(calls) == 1 and caught.value.usage_known is known and caught.value.request_sent
    if known:
        assert caught.value.usage.cost_usd == pytest.approx(.003) and caught.value.usage.calls == 1
    else:
        assert caught.value.usage is None


@pytest.mark.parametrize('status', [400, 401, 429, 503])
def test_http_status_is_safe_and_queue_never_retries_or_invents_free_usage(monkeypatch, source, criteria, status):
    from app.evaluations import EvaluationQueue
    adapter, config, calls = install(monkeypatch, [lambda request, body: httpx.Response(status, text='private body synthetic-key')])
    queue = EvaluationQueue(None, config)
    with pytest.raises(JudgeError, match=f'HTTP {status}') as caught:
        asyncio.run(queue._invoke_with_retries(adapter.judge_batch, (source, [criteria['contact']]), {}))
    assert len(calls) == 1 and caught.value.usage is None and not caught.value.usage_known
    assert not hasattr(caught.value, 'status_code') and not hasattr(caught.value, 'response')
    assert 'private' not in str(caught.value) and 'synthetic-key' not in str(caught.value)


@pytest.mark.parametrize('failure,expected', [
    (httpx.ReadTimeout('private timeout synthetic-key'), 'время ожидания'),
    (httpx.ConnectError('private connection synthetic-key'), 'Сбой соединения'),
    (asyncio.TimeoutError('private deadline synthetic-key'), 'время ожидания'),
])
def test_transport_failure_has_unknown_billing_and_no_paid_retry(monkeypatch, source, criteria, failure, expected):
    adapter, config, calls = install(monkeypatch, [failure])
    with pytest.raises(JudgeError, match=expected) as caught:
        asyncio.run(adapter.judge(source, criteria['contact']))
    assert len(calls) == 1 and caught.value.usage is None and caught.value.request_sent
    assert 'private' not in str(caught.value) and 'synthetic-key' not in str(caught.value)


def _delay_mock_requests(monkeypatch, delay):
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


def test_one_request_uses_full_bounded_budget(monkeypatch, source, criteria):
    adapter, config, calls = install(monkeypatch, [verdict()], model_timeout=.4)
    started, cancelled, deadlines = _delay_mock_requests(monkeypatch, .12)
    assert asyncio.run(adapter.judge(source, criteria['contact'])).usage.calls == 1
    assert len(calls) == len(started) == 1 and not cancelled
    assert .3 < deadlines[0] < config.model_timeout


def test_deadline_cancels_single_request_without_retry_or_fabricated_receipt(monkeypatch, source, criteria):
    adapter, config, calls = install(monkeypatch, [verdict()], model_timeout=.1)
    started, cancelled, deadlines = _delay_mock_requests(monkeypatch, .2)
    with pytest.raises(JudgeError, match='время ожидания') as caught:
        asyncio.run(adapter.judge(source, criteria['contact']))
    assert len(started) == len(cancelled) == 1 and not calls
    assert caught.value.usage is None and caught.value.request_sent


def test_output_limit_is_billed_distinct_and_not_retried_or_logged_as_content(monkeypatch, source, criteria, caplog):
    def response(request, body):
        return httpx.Response(200, json={'model': 'test/actual-model',
            'choices': [{'finish_reason': 'length', 'message': {'content': None, 'reasoning': 'private reasoning synthetic-key'}}],
            'usage': {'prompt_tokens': 100, 'completion_tokens': 8188, 'cost': .031,
                      'completion_tokens_details': {'reasoning_tokens': 8100}}})
    adapter, config, calls = install(monkeypatch, [response])
    with pytest.raises(JudgeError, match='ограничения длины') as caught:
        asyncio.run(adapter.judge(source, criteria['contact']))
    assert len(calls) == 1 and caught.value.failure_reason == 'output_limit'
    assert caught.value.usage.calls == 1 and caught.value.usage.cost_usd == pytest.approx(.031)
    assert '"finishReason": "length"' in caplog.text and '"reasoningTokens": 8100' in caplog.text
    assert 'private reasoning' not in caplog.text and 'synthetic-key' not in caplog.text


@pytest.mark.parametrize('change', [
    {'judge_model': ''}, {'judge_max_tokens': 0}, {'judge_max_tokens': 32769},
    {'judge_max_tokens': True}, {'model_timeout': 0}, {'model_timeout': float('nan')},
    {'model_timeout': float('inf')}, {'model_timeout': 601},
])
def test_invalid_configuration_fails_before_request_with_known_zero_usage(monkeypatch, source, criteria, change):
    adapter, config, calls = install(monkeypatch, [verdict()])
    for key, value in change.items():
        setattr(config, key, value)
    with pytest.raises(JudgeError) as caught:
        asyncio.run(adapter.judge(source, criteria['contact']))
    assert not calls and not caught.value.request_sent and caught.value.usage_known
    assert caught.value.usage.calls == 0


def test_empty_batch_and_duplicate_criteria_never_send_request(monkeypatch, source, criteria):
    adapter, config, calls = install(monkeypatch, [verdict()])
    empty = asyncio.run(adapter.judge_batch(source, []))
    assert not empty.request_sent and empty.usage.calls == 0
    with pytest.raises(JudgeError):
        asyncio.run(adapter.judge_batch(source, [criteria['contact'], criteria['contact']]))
    assert not calls


def test_semantic_identity_is_new_and_excludes_transport_budgets_and_legacy_mode():
    from app.judge import openrouter as adapter
    config = Settings(judge_model='google/gemini-3.8-flash', judge_output_mode='tool', judge_temperature=0)
    adapter.configure(config)
    identity = adapter.cache_identity()
    assert identity.startswith('openrouter:batch-v3:')
    assert adapter.compatible_cache_identities() == {identity}
    config.judge_max_tokens, config.model_timeout, config.judge_output_mode = 16384, 300, 'schema'
    assert adapter.cache_identity() == identity
    config.judge_model = 'test/other-model'
    assert adapter.cache_identity() != identity
    assert adapter.compatible_cache_identities() == {adapter.cache_identity()}


def test_prompt_changes_invalidate_judge_but_preserve_unrelated_ai_cache(monkeypatch, tmp_path):
    from app.judge import openrouter as adapter
    from app.ai import openrouter as ai
    config = Settings(judge_model='google/gemini-3.8-flash', judge_temperature=0)
    adapter.configure(config)
    ai.configure(config)
    before, ai_before = adapter.cache_identity(), ai.cache_identity()
    for path in adapter._PROMPTS.glob('*.md'):
        (tmp_path / path.name).write_bytes(path.read_bytes())
    monkeypatch.setattr(adapter, '_PROMPTS', tmp_path)
    assert adapter.cache_identity() == before
    path = tmp_path / 'system.md'
    path.write_text(path.read_text(encoding='utf-8') + '\nChanged semantic policy.', encoding='utf-8')
    assert adapter.cache_identity() != before and ai.cache_identity() == ai_before


def test_domain_validation_policy_temperature_and_answer_contract_change_identity(monkeypatch):
    from app import evaluations
    from app.judge import openrouter as adapter
    config = Settings(judge_model='google/gemini-3.8-flash', judge_temperature=0)
    adapter.configure(config)
    previous = adapter.cache_identity()
    config.judge_temperature = .1
    assert adapter.cache_identity() != previous
    previous = adapter.cache_identity()

    def changed_validation(*args, **kwargs):
        return None
    monkeypatch.setattr(evaluations, 'validate_judge_result', changed_validation)
    assert adapter.cache_identity() != previous
    previous = adapter.cache_identity()
    monkeypatch.setattr(adapter, '_SEMANTIC_CONTRACT_VERSION', 'changed-policy')
    assert adapter.cache_identity() != previous
    previous = adapter.cache_identity()
    monkeypatch.setattr(adapter, 'Answer', str)
    assert adapter.cache_identity() != previous


def test_hints_change_invalidates_judge_identity(monkeypatch):
    from app.judge import openrouter as adapter
    adapter.configure(Settings(judge_model='google/gemini-3.8-flash'))
    before = adapter.cache_identity()
    original = Path.read_text

    def changed(path, *args, **kwargs):
        text = original(path, *args, **kwargs)
        return text + '\n# changed hint semantics' if path.name == 'hints.py' else text
    monkeypatch.setattr(Path, 'read_text', changed)
    assert adapter.cache_identity() != before


def test_real_alias_exports_identical_batch_provider():
    from app import judge
    from app.judge import openrouter
    assert judge.judge_batch is openrouter.judge_batch and judge.judge is openrouter.judge

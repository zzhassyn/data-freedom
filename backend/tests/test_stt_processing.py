"""All transcription values here are synthetic, including names and number groups."""
import copy
import json
import math

import pytest

from app.stt.processing import PrivacyError, annotate_roles, build, mask, mask_prepared, prepare


def words(text, speaker='test-speaker', start=0, step=.3):
    return [{'word': word, 'start': start + i * step, 'end': start + i * step + .2, 'speaker': speaker}
            for i, word in enumerate(text.split())]


def public(rows, organizer):
    return build(mask_prepared(prepare(rows, organizer)))


@pytest.mark.parametrize(('text', 'label', 'secret'), [
    ('ИИН 111222333444 указан.', '[ИИН скрыт]', '111222333444'),
    ('ИИН 111 222-333 444 указан.', '[ИИН скрыт]', '111'),
    ('Карта 1111 2222 3333 4444.', '[Карта скрыта]', '1111'),
    ('Телефон +7 (777) 111-22-33.', '[Телефон скрыт]', '777'),
    ('Запишите 777 111 22 33.', '[Телефон скрыт]', '777'),
    ('Звоните +44 20 1111 2222.', '[Телефон скрыт]', '1111'),
    ('СМС код, который сейчас пришёл: 112233.', '[Код скрыт]', '112233'),
    ('112233, это мой код.', '[Код скрыт]', '112233'),
    ('Мой адрес: улица Тестовая, дом 12, кв. 34.', '[Адрес скрыт]', 'Тестовая'),
    ('Почта test.person@example.invalid.', '[Почта скрыта]', 'test.person'),
])
def test_patterns_replace_entire_sensitive_values(text, label, secret):
    result, spans = mask(text)
    assert label in result
    assert secret not in result
    assert spans
    assert all(set(span) == {'start', 'end', 'type', 'label'} for span in spans)
    assert all(result[s['start']:s['end']] == s['label'] for s in spans)
    assert secret not in json.dumps(spans, ensure_ascii=False)


@pytest.mark.parametrize('text', [
    'ИИН ноль ноль один двести двадцать два триста тридцать три четыреста сорок четыре.',
    'ЖСН нөл нөл бір екі жүз жиырма екі үш жүз отыз үш төрт жүз қырық төрт.',
    'IIN zero zero one two hundred twenty two three hundred thirty three four hundred forty four.',
    'ИИН 111 двести двадцать два 333 четыреста сорок четыре.',
    'ИИН one two three four five six seven eight nine one two three.',
])
def test_spoken_and_mixed_identity_groups_are_redacted(text):
    result, _ = mask(text)
    assert '[ИИН скрыт]' in result
    assert result.rstrip('.').endswith('[ИИН скрыт]')


@pytest.mark.parametrize(('text', 'label'), [
    ('Код one two three four five six.', '[Код скрыт]'),
    ('Қод бір екі үш төрт бес алты.', '[Код скрыт]'),
    ('Пароль: один два три четыре.', '[Код скрыт]'),
    ('Карта one one one one two two two two three three three three four four four four.', '[Карта скрыта]'),
])
def test_spoken_codes_and_cards(text, label):
    result, _ = mask(text)
    assert result.endswith(label + '.')


@pytest.mark.parametrize('domain', ['ffin.kz', 'fbroker.kz', 'freedom.kz', 'freedom-test.kz', 'freedom24.kz'])
def test_corporate_mail_is_allowed(domain):
    value = f'support@{domain}'
    assert mask(value) == (value, [])


@pytest.mark.parametrize('domain', ['ffin.kz.example.org', 'evilffin.kz', 'freedom-test.kz.example.org', 'fbroker.kz.evil', 'freedom.example.kz'])
def test_near_corporate_domains_are_private(domain):
    assert mask(f'test@{domain}')[0] == '[Почта скрыта]'


def test_useful_safe_content_survives():
    text = 'Тариф 25 долларов, комиссия 2 процента. Ответ будет через два часа. Дома нет связи. Пишу домой. support@ffin.kz'
    assert mask(text) == (text, [])


@pytest.mark.parametrize(('first', 'second', 'label'), [
    ('Мой ИИН 111 222', '333 444', '[ИИН скрыт]'),
    ('СМС код', '111 222', '[Код скрыт]'),
    ('111 222', 'мой код', '[Код скрыт]'),
    ('Карта 1111 2222', '3333 4444', '[Карта скрыта]'),
    ('Улица Тестовая', 'дом 12 квартира 34.', '[Адрес скрыт]'),
])
def test_masks_cross_speaker_turn_boundaries(first, second, label):
    result = public(words(first, 'a') + words(second, 'b', start=5), [])
    assert label in '\n'.join(t['text'] for t in result['turns'])
    assert not any(char.isdecimal() for turn in result['turns'] for char in turn['text'])
    assert 'Тестовая' not in json.dumps(result, ensure_ascii=False)


def test_name_alignment_retains_useful_surroundings_and_masks_both_words():
    organizer = [{'idx': 7, 'speaker': 'client', 'text': 'Здравствуйте, меня зовут [Имя скрыто], хочу уточнить тариф.'}]
    result = public(words('Здравствуйте, меня зовут Тестон Примеров, хочу уточнить тариф.'), organizer)
    text = result['turns'][0]['text']
    assert text == 'Здравствуйте, меня зовут [Имя скрыто], хочу уточнить тариф.'
    assert result['turns'][0]['orgIdx'] == 7
    assert 'Тестон' not in json.dumps(result, ensure_ascii=False)
    assert 'Примеров' not in json.dumps(result, ensure_ascii=False)


def test_name_split_across_turns_is_not_leaked():
    organizer = [{'idx': 0, 'speaker': 'client', 'text': 'Здравствуйте, меня зовут [Имя скрыто], хочу уточнить тариф.'}]
    result = public(words('Здравствуйте, меня зовут Тестон', 'a') + words('Примеров, хочу уточнить тариф.', 'a', start=5), organizer)
    assert len(result['turns']) == 2
    assert all('[Имя скрыто]' in turn['text'] for turn in result['turns'])
    assert all('Тестон' not in turn['text'] and 'Примеров' not in turn['text'] for turn in result['turns'])


def test_repeated_name_context_redacts_every_candidate():
    organizer = [{'idx': 0, 'speaker': 'client', 'text': 'Здравствуйте, меня зовут [Имя скрыто], хочу уточнить тариф.'}]
    text = 'Здравствуйте, меня зовут Тестон Примеров, хочу уточнить тариф. Здравствуйте, меня зовут Тестон Примеров, хочу уточнить тариф.'
    result = public(words(text), organizer)
    assert result['turns'][0]['text'].count('[Имя скрыто]') == 2
    assert 'Тестон' not in json.dumps(result, ensure_ascii=False)


def test_unknown_mask_alignment_fails_even_when_order_mapping_exists():
    organizer = [{'idx': 3, 'speaker': 'client', 'text': '[Персональные данные скрыты] Запросить консультацию сейчас.'}]
    prepared = prepare(words('Тестон Примеров произносит совершенно другие слова'), organizer)
    assert prepared.turns[0]['orgIdx'] == 3  # Seeking fallback is deliberately not trusted for privacy.
    with pytest.raises(PrivacyError, match='безопасно'):
        mask_prepared(prepared)
    with pytest.raises(TypeError):
        build(prepared)


def test_bounded_uncertain_region_is_conservatively_redacted():
    organizer = [{'idx': 0, 'speaker': 'client', 'text': 'Добрый день коллеги [Персональные данные скрыты] хочу уточнить тариф.'}]
    result = public(words('Добрый день коллеги Тестон Примеров и ещё неточная часть записи хочу уточнить тариф.'), organizer)
    assert result['turns'][0]['text'] == 'Добрый день коллеги [Персональные данные скрыты] хочу уточнить тариф.'


def test_roles_require_ten_matched_tokens_and_system_does_not_vote():
    client_text = 'Раз два три четыре пять шесть семь восемь девять десять одиннадцать'
    operator_text = 'Здравствуйте уточните пожалуйста ваш вопрос'
    rows = words(client_text, 'provider-name') + words(operator_text, 'other', start=5)
    organizer = [{'idx': 2, 'speaker': 'client', 'text': client_text}, {'idx': 3, 'speaker': 'operator', 'text': operator_text},
                 {'idx': 4, 'speaker': 'system', 'text': operator_text * 3}]
    result = public(rows, organizer)
    assert result['speakers'] == [{'speakerId': 'speaker_0', 'role': 'client'}, {'speakerId': 'speaker_1', 'role': 'unknown'}]
    assert 'provider-name' not in json.dumps(result)


def test_turn_split_pause_timing_doubtful_and_public_field_whitelist():
    rows = [dict(word='Первое', start=0, end=.5, speaker='a', secret='never copy'),
            dict(word='второе', start=.7, end=1, speaker='a'),
            dict(word='третье', start=2.3, end=8, speaker='a'),
            dict(word='четвёртое', start=8.1, end=8.3, speaker='b')]
    result = public(rows, [])
    assert len(result['turns']) == 3
    assert result['turns'][1]['doubtful'] is True
    assert result['turns'][0]['start'] == 0 and result['turns'][0]['end'] == 1
    assert set(result['turns'][0]) == {'idx', 'start', 'end', 'speakerId', 'doubtful', 'orgIdx', 'text'}
    assert 'never copy' not in json.dumps(result)
    result['turns'][0]['text'] = 'mutated'
    assert public(rows, [])['turns'][0]['text'] != 'mutated'


@pytest.mark.parametrize(('start', 'end'), [(math.nan, 1), (0, math.inf), (-1, 1), (3, 1), (False, 1), ('0', 1)])
def test_invalid_timestamps_never_produce_public_output(start, end):
    with pytest.raises(ValueError, match='таймкод'):
        prepare([{'word': 'Тест', 'start': start, 'end': end}], [])


def test_missing_words_and_nonmonotonic_times_fail():
    with pytest.raises(ValueError):
        prepare([], [])
    with pytest.raises(ValueError, match='порядок'):
        prepare(words('второе', start=5) + words('первое', start=0), [])


def test_existing_masks_are_idempotent():
    text = 'Данные [ИИН скрыт], [Имя скрыто], [Код скрыт].'
    assert mask(text) == (text, [])


@pytest.mark.parametrize('text', ['ИИН [111222333444 hidden]', 'ИИН [111222333444 скрыт]', 'ИИН111222333444скрыт', 'ИИН 111\u200b222\u2011333\u2060444'])
def test_provider_brackets_glued_words_and_invisible_separators_are_untrusted(text):
    result, _ = mask(text)
    assert '111' not in result and '222' not in result
    assert '[ИИН скрыт]' in result


def test_repeated_short_name_context_masks_every_candidate():
    organizer = [{'idx': 0, 'speaker': 'client', 'text': 'Имя [Имя скрыто]. Добрый день помогите пожалуйста разобраться.'}]
    result = public(words('Имя Тестон. Добрый день помогите пожалуйста разобраться. Имя Примерон. Добрый день помогите пожалуйста разобраться.'), organizer)
    assert 'Тестон' not in result['turns'][0]['text']
    assert 'Примерон' not in result['turns'][0]['text']


@pytest.mark.parametrize('text', ['12 Example Street', '12 Example Street, apartment 34', 'Мой адрес: Тестовая көшесі 12, пәтер 34'])
def test_address_name_before_street_marker_is_not_exposed(text):
    result, _ = mask(text)
    assert 'Example' not in result and 'Тестовая' not in result
    assert not any(char.isdecimal() for char in result)
    assert '[Адрес скрыт]' in result


def test_pause_uses_previous_word_not_earlier_stretched_interval():
    result = public([{'word': 'первое', 'start': 0, 'end': 68, 'speaker': 'a'},
                     {'word': 'второе', 'start': 1, 'end': 1.2, 'speaker': 'a'},
                     {'word': 'третье', 'start': 4, 'end': 4.2, 'speaker': 'a'}], [])
    assert len(result['turns']) == 2
    assert result['turns'][0]['doubtful'] is True


@pytest.mark.parametrize('text', [
    'сто один двести два триста три четыреста четыре',
    'one hundred one two hundred two three hundred three four hundred four',
    'бір жүз бір екі жүз екі үш жүз үш төрт жүз төрт',
])
def test_four_spoken_three_digit_groups_without_keyword(text):
    assert mask(text)[0] == '[ИИН скрыт]'


def role_turn(text, idx=0, **extra):
    return {'idx': idx, 'text': text, 'start': idx * 4.0, 'end': idx * 4.0 + 2,
            'speakerId': 'shared', 'orgIdx': 99, 'doubtful': False, **extra}


def test_turn_roles_correct_shared_bot_client_voice_without_changing_content():
    greeting = 'Здравствуйте вы позвонили в справочную службу нашей компании'
    request = 'Мне нужна помощь с настройкой приложения на телефоне сегодня пожалуйста'
    turns = [role_turn(greeting), role_turn(request, 5), role_turn('Да', 9)]
    speakers = [{'speakerId': 'shared', 'role': 'client'}]
    organizer = [{'idx': 99, 'speaker': 'bot', 'text': greeting},
                 {'idx': 100, 'speaker': 'client', 'text': request}]
    before = copy.deepcopy((turns, speakers, organizer))
    result = annotate_roles(turns, speakers, organizer)
    assert [(t['role'], t['roleSource']) for t in result] == [
        ('bot', 'aligned'), ('client', 'aligned'), ('client', 'speaker')]
    assert [{key: value for key, value in turn.items() if key not in {'role', 'roleSource'}}
            for turn in result] == turns
    assert (turns, speakers, organizer) == before
    assert annotate_roles(result, speakers, organizer) == result


@pytest.mark.parametrize(('speaker_role', 'matched_words', 'expected', 'source'), [
    ('client', 5, 'client', 'speaker'), ('client', 6, 'bot', 'aligned'),
    ('unknown', 2, 'unknown', 'speaker'), ('unknown', 3, 'bot', 'aligned'),
])
def test_turn_role_minimum_evidence(speaker_role, matched_words, expected, source):
    text = 'Здравствуйте вы позвонили в справочную службу'.split()
    result = annotate_roles([role_turn(' '.join(text[:matched_words]))],
                            [{'speakerId': 'shared', 'role': speaker_role}],
                            [{'speaker': 'bot', 'text': ' '.join(text)}])
    assert (result[0]['role'], result[0]['roleSource']) == (expected, source)


@pytest.mark.parametrize(('client_text', 'expected', 'source'), [
    ('Пожалуйста помогите мне разобраться', 'unknown', 'speaker'),
    ('Пожалуйста помогите мне', 'bot', 'aligned'),
])
def test_turn_role_needs_eighty_percent_dominance(client_text, expected, source):
    bot_text = 'Здравствуйте вы позвонили в нашу справочную службу ожидайте свободного оператора оставайтесь на линии'
    result = annotate_roles([role_turn(bot_text + '. ' + client_text)], [],
                            [{'speaker': 'bot', 'text': bot_text},
                             {'speaker': 'client', 'text': client_text}])
    assert (result[0]['role'], result[0]['roleSource']) == (expected, source)


def test_order_fallback_masks_and_system_text_are_not_role_evidence():
    turns = [role_turn('Совершенно другая речь'), role_turn('[Имя скрыто] [ИИН скрыт]', 1),
             role_turn('Служебная отметка о переводе', 2)]
    organizer = [{'idx': 99, 'speaker': 'bot', 'text': 'Здравствуйте вы позвонили в справочную службу'},
                 {'idx': 100, 'speaker': 'bot', 'text': '[Имя скрыто] [ИИН скрыт]'},
                 {'idx': 101, 'speaker': 'system', 'text': turns[2]['text']}]
    result = annotate_roles(turns, [{'speakerId': 'shared', 'role': 'client'}], organizer)
    assert [(turn['role'], turn['roleSource']) for turn in result] == [('client', 'speaker')] * 3


def test_phrase_shared_by_different_roles_remains_ambiguous():
    text = 'Уточните пожалуйста ваш вопрос'
    result = annotate_roles([role_turn(text)], [],
                            [{'speaker': 'client', 'text': text}, {'speaker': 'operator', 'text': text}])
    assert (result[0]['role'], result[0]['roleSource']) == ('unknown', 'speaker')


def test_short_chains_must_not_join_across_turn_or_source_boundaries():
    source = [{'speaker': 'bot', 'text': 'Здравствуйте вы позвонили'}]
    result = annotate_roles([role_turn('Здравствуйте вы'), role_turn('позвонили', 1)], [], source)
    assert all(turn['role'] == 'unknown' for turn in result)
    result = annotate_roles([role_turn('Здравствуйте вы позвонили')], [],
                            [{'speaker': 'bot', 'text': 'Здравствуйте вы'},
                             {'speaker': 'bot', 'text': 'позвонили'}])
    assert result[0]['role'] == 'unknown'

"""Pure transcription alignment and redaction. Raw provider text never leaves build()."""
from __future__ import annotations

import copy
import difflib
import math
import re
from collections import Counter, defaultdict
from dataclasses import dataclass
from typing import Any


class PrivacyError(ValueError):
    """The source masks cannot be safely transferred to the recognized speech."""


_TOKEN = re.compile(r"\d+|[^\W\d_]+(?:['’][^\W\d_]+)*", re.UNICODE)
_SOURCE_MASK = re.compile(r"\[[^\]\n]*(?:скрыт|hidden|redacted)[^\]\n]*\]", re.I)
_SAFE_MASK = re.compile(r"\[(?:ИИН скрыт|Карта скрыта|Телефон скрыт|Код скрыт|Почта скрыта|Адрес скрыт|Имя скрыто|Персональные данные скрыты)\]", re.I)
_EMAIL = re.compile(r"[\w.!#$%&'*+/=?^`{|}~-]+\s*@\s*[\w-]+(?:\s*\.\s*[\w-]+)+", re.UNICODE)
_DIGITS = re.compile(r"(?<!\d)\+?\d(?:[\s\u00a0\u202f\u200b\u200c\u200d\u2060\ufeff()\-‐‑‒–—−.,]*\d){3,}(?!\d)")
_ADDRESS = re.compile(r"(?<!\w)(?:улиц[аеуы]?|ул\.|проспект(?:е|а)?|пр-т|дом|д\.|квартир[аеуы]?|кв\.|көше(?:сі|сінде)?|пәтер|street|avenue|road|apartment|flat|house)(?!\w)", re.I)
_CONTEXT = {
    'iin': {'иин', 'жсн', 'iin', 'идентификационный', 'идентификационного'},
    'card': {'карта', 'карты', 'карте', 'карточки', 'card', 'картасы', 'картаның'},
    'phone': {'телефон', 'телефона', 'телефону', 'телефоны', 'номер', 'номеру', 'номера', 'phone', 'mobile', 'нөмір', 'нөмірі', 'нөміріңіз'},
    'code': {'код', 'кода', 'кодом', 'коду', 'коды', 'смс', 'sms', 'пароль', 'пароля', 'қод', 'кодты', 'кодын', 'code', 'password', 'otp'},
}
_LABELS = {'iin': '[ИИН скрыт]', 'card': '[Карта скрыта]', 'phone': '[Телефон скрыт]',
           'code': '[Код скрыт]', 'email': '[Почта скрыта]', 'address': '[Адрес скрыт]',
           'name': '[Имя скрыто]', 'personal': '[Персональные данные скрыты]'}
_NUMBER_VALUES: dict[str, int] = {}
for _words, _values in [
    ('ноль нуль один одна одно два две три четыре пять шесть семь восемь девять', [0, 0, 1, 1, 1, 2, 2, 3, 4, 5, 6, 7, 8, 9]),
    ('десять одиннадцать двенадцать тринадцать четырнадцать пятнадцать шестнадцать семнадцать восемнадцать девятнадцать', range(10, 20)),
    ('двадцать тридцать сорок пятьдесят шестьдесят семьдесят восемьдесят девяносто', range(20, 100, 10)),
    ('сто двести триста четыреста пятьсот шестьсот семьсот восемьсот девятьсот', range(100, 1000, 100)),
    ('нөл ноль бір екі үш төрт бес алты жеті сегіз тоғыз', [0, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9]),
    ('он жиырма отыз қырық елу алпыс жетпіс сексен тоқсан жүз мың', [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 1000]),
    ('zero oh one two three four five six seven eight nine', [0, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9]),
    ('ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen', range(10, 20)),
    ('twenty thirty forty fifty sixty seventy eighty ninety hundred thousand', [20, 30, 40, 50, 60, 70, 80, 90, 100, 1000]),
]:
    _NUMBER_VALUES.update(zip(_words.split(), _values))
_NUMBER_VALUES.update({'тысяча': 1000, 'тысячи': 1000, 'тысяч': 1000})
_CONNECTORS = {'и', 'and', 'мен'}


def _normal(text: str) -> str:
    return text.casefold().replace('ё', 'е')


def _tokens(text: str, mask_pattern: re.Pattern = _SAFE_MASK) -> list[dict[str, Any]]:
    ignored = [(m.start(), m.end()) for m in mask_pattern.finditer(text)]
    return [{'text': _normal(m.group()), 'start': m.start(), 'end': m.end()}
            for m in _TOKEN.finditer(text)
            if not any(a <= m.start() < b for a, b in ignored)]


def _context(tokens: list[dict[str, Any]], start: int, end: int) -> set[str]:
    before = [t['text'] for t in tokens if t['end'] <= start][-5:]
    after = [t['text'] for t in tokens if t['start'] >= end][:5]
    return set(before + after)


def _kind(length: int | None, nearby: set[str], plus: bool = False, digits: str = '') -> str | None:
    if length == 16:
        return 'card'
    if length is not None and plus and 8 <= length <= 15:
        return 'phone'
    if length == 12:
        return 'iin'
    if nearby & _CONTEXT['iin']:
        return 'iin'
    if nearby & _CONTEXT['card']:
        return 'card'
    if nearby & _CONTEXT['code'] and (length is None or 4 <= length <= 6):
        return 'code'
    if length is not None and ((plus and 8 <= length <= 15) or (length == 11 and digits.startswith(('7', '8'))) or (length == 10 and digits.startswith('7'))):
        return 'phone'
    if nearby & _CONTEXT['phone'] and (length is None or length >= 7):
        return 'phone'
    if length is not None and length > 16:
        return 'personal'
    return None


def _sentence_end(text: str, start: int) -> int:
    for match in re.finditer(r'[.!?;]', text[start:]):
        at = start + match.start()
        if text[at] == '.':
            previous = re.search(r'([^\W\d_]+)$', text[:at])
            if previous and _normal(previous.group()) in {'ул', 'д', 'кв', 'пр', 'st'}:
                continue
            if at and at + 1 < len(text) and text[at - 1].isdigit() and text[at + 1].isdigit():
                continue
        return at
    return len(text)


def _spoken_digits(values: list[dict[str, Any]]) -> str:
    """Join recognisable spoken groups for classification, never as output data."""
    if all(t['text'].isdecimal() or _NUMBER_VALUES[t['text']] < 10 for t in values):
        return ''.join(t['text'] if t['text'].isdecimal() else str(_NUMBER_VALUES[t['text']]) for t in values)
    groups: list[str] = []
    current: int | None = None
    previous: int | None = None
    for index, token in enumerate(values):
        raw = token['text']
        if raw.isdecimal():
            if current is not None:
                groups.append(str(current))
            groups.append(raw)
            current = previous = None
            continue
        value = _NUMBER_VALUES[raw]
        next_value = _NUMBER_VALUES.get(values[index + 1]['text']) if index + 1 < len(values) else None
        if current is None:
            current = value
        elif value in {100, 1000} and current < value:
            current *= value
        elif value >= 100 or (value >= 10 and current % 100 >= 10) or (value < 10 and next_value == 100 and current >= 10) or (value < 10 and previous is not None and previous < 10):
            groups.append(str(current))
            current = value
        else:
            current += value
        previous = value
    if current is not None:
        groups.append(str(current))
    return ''.join(groups)


def _detections(text: str) -> list[tuple[int, int, str, str]]:
    """Offsets here refer to the ephemeral input; nothing contains a matched value."""
    tokens = _tokens(text)
    spans: list[tuple[int, int, str, str]] = []
    existing = [(m.start(), m.end()) for m in _SAFE_MASK.finditer(text)]

    def add(start: int, end: int, kind: str) -> None:
        if start < end and not any(a <= start and end <= b for a, b in existing):
            spans.append((start, end, kind, _LABELS[kind]))

    for match in _EMAIL.finditer(text):
        domain = re.sub(r'\s+', '', match.group().split('@', 1)[1]).casefold()
        corporate = domain in {'fbroker.kz', 'ffin.kz'} or re.fullmatch(r'freedom(?:[a-z0-9-]*[a-z0-9])?\.kz', domain)
        if not corporate:
            add(match.start(), match.end(), 'email')
    for match in _DIGITS.finditer(text):
        digits = ''.join(c for c in match.group() if c.isdecimal())
        kind = _kind(len(digits), _context(tokens, match.start(), match.end()), match.group().startswith('+'), digits)
        if kind:
            add(match.start(), match.end(), kind)

    # Spoken groups are deliberately redacted as a whole in a sensitive context.
    # There is no need to guess their numeric value and risk losing leading zeros.
    index = 0
    while index < len(tokens):
        numeric = lambda t: t['text'].isdecimal() or t['text'] in _NUMBER_VALUES
        if not numeric(tokens[index]):
            index += 1
            continue
        stop = index + 1
        while stop < len(tokens):
            if numeric(tokens[stop]) or (tokens[stop]['text'] in _CONNECTORS and stop + 1 < len(tokens) and numeric(tokens[stop + 1])):
                stop += 1
            else:
                break
        group = tokens[index:stop]
        if any(t['text'] in _NUMBER_VALUES for t in group):
            values = [t for t in group if t['text'] not in _CONNECTORS]
            digits = _spoken_digits(values)
            length = len(digits) if digits else None
            start, end = group[0]['start'], group[-1]['end']
            kind = _kind(length, _context(tokens, start, end), digits=digits)
            # A long uninterpretable run of number words can be grouped identity data.
            if not kind and len(values) >= 10:
                kind = 'personal'
            if kind:
                add(start, end, kind)
        index = stop

    for match in _ADDRESS.finditer(text):
        end = _sentence_end(text, match.end())
        tail = text[match.end():end]
        marker = _normal(match.group())
        strong = marker.startswith(('улиц', 'ул.', 'проспект', 'пр-т', 'көше')) or marker in {'street', 'avenue', 'road'}
        postfix = marker.startswith('көше') or marker in {'street', 'avenue', 'road'}
        if re.search(r'\d', tail) or (strong and re.search(r'[^\W\d_]{2,}', tail)) or (postfix and re.search(r'\d[^.!?;:]*$', text[:match.start()])):
            start = match.start()
            if postfix:
                # In these formats the street name/house number often precedes the marker.
                boundaries = list(re.finditer(r'[.!?;:]', text[:start]))
                start = boundaries[-1].end() if boundaries else 0
                while start < match.start() and text[start].isspace():
                    start += 1
            add(start, end, 'address')
    return spans


def _merge(spans: list[tuple[int, int, str, str]]) -> list[tuple[int, int, str, str]]:
    merged: list[tuple[int, int, str, str]] = []
    for start, end, kind, label in sorted(spans, key=lambda s: (s[0], -s[1])):
        if merged and start < merged[-1][1]:
            a, b, previous_kind, previous_label = merged[-1]
            if end <= b:
                continue
            selected_kind = kind if start == a else 'personal'
            merged[-1] = (a, max(b, end), selected_kind, _LABELS.get(selected_kind, label))
        else:
            merged.append((start, end, kind, label))
    return merged


def _replace(text: str, spans: list[tuple[int, int, str, str]]) -> tuple[str, list[dict[str, Any]]]:
    parts: list[str] = []
    public_spans: list[dict[str, Any]] = []
    position = output_length = 0
    for start, end, kind, label in _merge(spans):
        prefix = text[position:start]
        parts.extend([prefix, label])
        output_length += len(prefix)
        public_spans.append({'start': output_length, 'end': output_length + len(label), 'type': kind, 'label': label})
        output_length += len(label)
        position = end
    parts.append(text[position:])
    return ''.join(parts), public_spans


def mask(text: str) -> tuple[str, list[dict[str, Any]]]:
    """Return redacted text and label offsets in that redacted text, never originals."""
    if not isinstance(text, str):
        raise ValueError('Некорректный текст расшифровки')
    return _replace(text, _detections(text))


@dataclass(repr=False)
class PreparedTranscript:
    text: str
    turns: list[dict[str, Any]]
    speakers: list[dict[str, Any]]
    tokens: list[dict[str, Any]]
    organizer_tokens: list[dict[str, Any]]
    source_masks: list[dict[str, Any]]
    anchors: dict[int, int]


@dataclass(frozen=True)
class MaskedTranscript:
    turns: tuple[dict[str, Any], ...]
    speakers: tuple[dict[str, Any], ...]


def _get(value: Any, key: str, default: Any = None) -> Any:
    return value.get(key, default) if isinstance(value, dict) else getattr(value, key, default)


def prepare(words: list[dict[str, Any]], organizer_turns: list[Any]) -> PreparedTranscript:
    """Validate/group provider words and build lexical anchors without persisting text."""
    if not isinstance(words, list) or not words or len(words) > 50_000:
        raise ValueError('Некорректные слова расшифровки')
    groups: list[dict[str, Any]] = []
    speaker_ids: dict[str, str] = {}
    previous_start = -1.0
    previous_end = 0.0
    for item in words:
        if not isinstance(item, dict):
            raise ValueError('Некорректные слова расшифровки')
        text = item.get('word', item.get('text'))
        if not isinstance(text, str):
            raise ValueError('Некорректный текст расшифровки')
        text = text.strip()
        if not text:
            continue
        start, end = item.get('start'), item.get('end')
        if any(isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v) for v in (start, end)) or not 0 <= start <= end:
            raise ValueError('Некорректные таймкоды расшифровки')
        if start < previous_start:
            raise ValueError('Нарушен порядок таймкодов расшифровки')
        previous_start = start
        raw_speaker = item.get('speaker_id', item.get('speakerId', item.get('speaker')))
        raw_speaker = str(raw_speaker) if raw_speaker is not None else '__missing__'
        # Canonical opaque IDs cannot carry provider-supplied names or other text.
        speaker = speaker_ids.setdefault(raw_speaker, f'speaker_{len(speaker_ids)}')
        if not groups or groups[-1]['speakerId'] != speaker or start - previous_end > 1.2:
            groups.append({'idx': len(groups), 'start': float(start), 'end': float(end),
                           'speakerId': speaker, 'text': text, 'doubtful': end - start > 5})
        else:
            group = groups[-1]
            group['text'] += ('' if re.fullmatch(r'[,.;:!?]+', text) else ' ') + text
            group['end'] = max(group['end'], float(end))
            group['doubtful'] = group['doubtful'] or end - start > 5
        previous_end = end
    if not groups:
        raise ValueError('В расшифровке нет слов')
    position = 0
    for group in groups:
        group['_start'] = position
        position += len(group['text'])
        group['_end'] = position
        position += 1
    text = '\n'.join(group['text'] for group in groups)
    if len(text) > 2_000_000:
        raise ValueError('Слишком длинная расшифровка')
    ours = _tokens(text)
    current_turn = 0
    for token in ours:
        while current_turn + 1 < len(groups) and token['start'] >= groups[current_turn]['_end']:
            current_turn += 1
        token['turn'] = current_turn

    org: list[dict[str, Any]] = []
    masks: list[dict[str, Any]] = []
    source_rows: list[dict[str, Any]] = []
    for row_number, row in enumerate(organizer_turns):
        role = _get(row, 'speaker', _get(row, 'role', 'unknown'))
        source_text = _get(row, 'text', '')
        if role == 'system' or not isinstance(source_text, str) or not source_text.strip():
            continue
        idx = _get(row, 'idx', row_number)
        if isinstance(idx, bool) or not isinstance(idx, int) or idx < 0:
            idx = row_number
        row_tokens = _tokens(source_text, _SOURCE_MASK)
        for found in _SOURCE_MASK.finditer(source_text):
            label_text = _normal(found.group())
            kind = next((kind for kind, hints in [('iin', ('иин', 'жсн')), ('card', ('карт',)),
                ('phone', ('телефон',)), ('code', ('код', 'парол')), ('email', ('почт', 'email')),
                ('address', ('адрес',)), ('name', ('имя', 'фио', 'name'))] if any(hint in label_text for hint in hints)), 'personal')
            masks.append({'position': len(org) + sum(t['end'] <= found.start() for t in row_tokens),
                          'kind': kind, 'label': _LABELS[kind], 'row': idx})
        for token in row_tokens:
            org.append({**token, 'row': idx, 'role': role})
        source_rows.append({'idx': idx, 'role': role})
    if len(org) + len(ours) > 60_000:
        raise ValueError('Слишком длинная расшифровка для сопоставления')
    anchors: dict[int, int] = {}
    votes: dict[str, Counter] = defaultdict(Counter)
    turn_votes: dict[int, Counter] = defaultdict(Counter)
    for block in difflib.SequenceMatcher(None, [t['text'] for t in org], [t['text'] for t in ours], autojunk=False).get_matching_blocks():
        if block.size < 3:
            continue
        for offset in range(block.size):
            org_index, our_index = block.a + offset, block.b + offset
            anchors[org_index] = our_index
            a, b = org[org_index], ours[our_index]
            turn_votes[b['turn']][a['row']] += 1
            if a['role'] in {'operator', 'client', 'bot'}:
                votes[groups[b['turn']]['speakerId']][a['role']] += 1
    roles = {speaker: counts.most_common(1)[0][0] if sum(counts.values()) >= 10 else 'unknown'
             for speaker, counts in votes.items()}
    for index, turn in enumerate(groups):
        matched = turn_votes[index]
        # This fallback is for seeking only. Privacy transfer uses anchors below.
        fallback = source_rows[min(index, len(source_rows) - 1)]['idx'] if source_rows else None
        turn['orgIdx'] = matched.most_common(1)[0][0] if matched else fallback
    speakers = [{'speakerId': speaker, 'role': roles.get(speaker, 'unknown')} for speaker in speaker_ids.values()]
    return PreparedTranscript(text, groups, speakers, ours, org, masks, anchors)


def _occurrences(sequence: list[str], needle: list[str]) -> list[int]:
    if not needle:
        return []
    return [i for i in range(len(sequence) - len(needle) + 1) if sequence[i:i + len(needle)] == needle]


def _source_mask_spans(prepared: PreparedTranscript) -> list[tuple[int, int, str, str]]:
    if not prepared.source_masks:
        return []
    ours, org = prepared.tokens, prepared.organizer_tokens
    if not prepared.anchors:
        raise PrivacyError('Не удалось безопасно сопоставить скрытые личные данные')
    values = [t['text'] for t in ours]
    org_values = [t['text'] for t in org]
    spans: list[tuple[int, int, str, str]] = []

    def add(start: int, end: int, source: dict[str, Any]) -> None:
        while start < end and prepared.text[start] in ' \n\t,.;:!?':
            start += 1
        while start < end and prepared.text[end - 1] in ' \n\t,.;:!?':
            end -= 1
        if start < end:
            spans.append((start, end, source['kind'], source['label']))

    for source in prepared.source_masks:
        position = source['position']
        left = [i for i in prepared.anchors if i < position]
        right = [i for i in prepared.anchors if i >= position]
        start = ours[prepared.anchors[max(left)]]['end'] if left else 0
        end = ours[prepared.anchors[min(right)]]['start'] if right else len(prepared.text)
        if end < start:
            raise PrivacyError('Не удалось безопасно сопоставить скрытые личные данные')
        add(start, end, source)

        # Repeated exact contexts are ambiguous. Hide every bounded candidate;
        # choosing only one occurrence could disclose a repeated client name.
        before, after = org_values[max(0, position - 3):position], org_values[position:position + 3]
        contexts = [(before, after)]
        if before and len(after) >= 3:
            contexts.append((before[-1:], after))
        if len(before) >= 3 and after:
            contexts.append((before, after[:1]))
        for left_context, right_context in contexts:
            if not left_context or not right_context or len(left_context) + len(right_context) < 3:
                continue
            starts, ends = _occurrences(values, left_context), _occurrences(values, right_context)
            for first in starts:
                candidates = [last for last in ends if last >= first + len(left_context)]
                if not candidates:
                    continue
                last = min(candidates)
                a, b = ours[first + len(left_context) - 1]['end'], ours[last]['start']
                add(a, b, source)
    return spans


def mask_prepared(prepared: PreparedTranscript) -> MaskedTranscript:
    """Transfer source masks and redact patterns across turn boundaries atomically."""
    if not isinstance(prepared, PreparedTranscript):
        raise TypeError('Нужна подготовленная расшифровка')
    spans = _merge(_detections(prepared.text) + _source_mask_spans(prepared))
    output = []
    for turn in prepared.turns:
        a, b = turn['_start'], turn['_end']
        intersections = [(max(start, a) - a, min(end, b) - a, kind, label)
                         for start, end, kind, label in spans if start < b and end > a]
        text, _ = _replace(turn['text'], intersections)
        if _detections(text):
            raise PrivacyError('Не удалось полностью скрыть личные данные')
        output.append({key: turn[key] for key in ('idx', 'start', 'end', 'speakerId', 'doubtful', 'orgIdx')} | {'text': text})
    # Recheck joins as well: partial numeric groups must not survive on either side.
    if _detections('\n'.join(turn['text'] for turn in output)):
        raise PrivacyError('Не удалось полностью скрыть личные данные')
    return MaskedTranscript(tuple(output), tuple(copy.deepcopy(prepared.speakers)))


def build(masked: MaskedTranscript) -> dict[str, Any]:
    """Only sanitized data can become the persisted/public representation."""
    if not isinstance(masked, MaskedTranscript):
        raise TypeError('Перед сборкой необходимо скрыть личные данные')
    return {'turns': copy.deepcopy(list(masked.turns)), 'speakers': copy.deepcopy(list(masked.speakers))}


def annotate_roles(turns: list[dict[str, Any]], speakers: list[dict[str, Any]],
                   organizer_turns: list[Any]) -> list[dict[str, Any]]:
    """Add roles to sanitized turns without regrouping or changing their content.

    A provider speaker can include both an IVR and a person. Strong lexical
    evidence may override that speaker's role for one turn; seek-only orgIdx
    fallbacks and words inside privacy labels supply no role evidence.
    """
    valid_roles = {'operator', 'client', 'bot'}
    speaker_roles = {speaker['speakerId']: speaker.get('role', 'unknown') for speaker in speakers}
    result = copy.deepcopy(turns)
    for turn in result:
        fallback = speaker_roles.get(turn.get('speakerId'), 'unknown')
        turn['role'] = fallback if fallback in valid_roles else 'unknown'
        turn['roleSource'] = 'speaker'

    ours = [{'text': token['text'], 'turn': index}
            for index, turn in enumerate(turns) for token in _tokens(turn['text'])]
    org = []
    for row_index, row in enumerate(organizer_turns):
        role = _get(row, 'speaker', _get(row, 'role', 'unknown'))
        text = _get(row, 'text', '')
        if role == 'system' or not isinstance(text, str):
            continue
        org.extend({'text': token['text'], 'role': role, 'row': row_index}
                   for token in _tokens(text, _SOURCE_MASK))
    # Existing source/output size limits normally enforce this. Older stored
    # rows can still be returned safely with speaker fallbacks if oversized.
    if len(org) + len(ours) > 60_000:
        return result
    org_values, our_values = [t['text'] for t in org], [t['text'] for t in ours]
    prefixes: dict[tuple[str, ...], list[int]] = defaultdict(list)
    for index in range(len(org) - 2):
        if org[index]['row'] == org[index + 2]['row']:
            prefixes[tuple(org_values[index:index + 3])].append(index)
    votes: dict[int, Counter] = defaultdict(Counter)
    for block in difflib.SequenceMatcher(None, org_values, our_values, autojunk=False).get_matching_blocks():
        if block.size < 3:
            continue
        offset = 0
        while offset < block.size:
            source, target = org[block.a + offset], ours[block.b + offset]
            stop = offset + 1
            while (stop < block.size and org[block.a + stop]['row'] == source['row']
                   and ours[block.b + stop]['turn'] == target['turn']):
                stop += 1
            size = stop - offset
            if size >= 3:
                phrase = org_values[block.a + offset:block.a + stop]
                # A repeated phrase from different roles is ambiguous, even if
                # the sequence matcher selected only one occurrence.
                ambiguous = any(org[first]['role'] != source['role'] and first + size <= len(org)
                                and org[first]['row'] == org[first + size - 1]['row']
                                and org_values[first:first + size] == phrase
                                for first in prefixes[tuple(phrase[:3])])
                if not ambiguous:
                    votes[target['turn']][source['role']] += size
            offset = stop
    for index, turn in enumerate(result):
        counts = votes[index]
        if not counts:
            continue
        role, count = counts.most_common(1)[0]
        required = 6 if turn['role'] in valid_roles and role != turn['role'] else 3
        if role in valid_roles and count >= required and count / sum(counts.values()) >= 0.8:
            turn['role'] = role
            turn['roleSource'] = 'aligned'
    return result

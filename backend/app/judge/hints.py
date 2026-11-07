"""Transcript observations and hash-bound clarifications for the real judge."""

import json
import re
from functools import lru_cache
from math import isfinite
from pathlib import Path

from pydantic import ValidationError

from ..checklists import prepare_criterion
from ..errors import ApiError
from ..models import Conversation, Criterion


PROMPTS_DIR = Path(__file__).with_name('prompts')
_SEED_PATH = Path(__file__).parent.parent / 'seed' / 'checklist_v1.json'


def _event_pattern(pattern):
    # Match a whole system event, not a quoted phrase or a negated assertion.
    return re.compile(r'\s*(?:' + pattern + r')[.!?;:\s]*', re.IGNORECASE)


_IDENTITY = _event_pattern(
    r'(?:личность клиента|идентификация клиента) (?:успешно )?(?:подтверждена|пройдена)'
    r'|клиенттің (?:жеке басы|тұлғасы) (?:сәтті )?расталды'
    r'|(?:customer|client) identity (?:has been |was |is )?(?:successfully )?(?:verified|confirmed)'
)
_CONNECTION = _event_pattern(
    r'агент присоединился к разговору с клиентом'
    r'|(?:оператор|агент) подключился к (?:разговору|клиенту)'
    r'|соединение с клиентом установлено'
    r'|(?:agent|operator) (?:has )?joined (?:the )?(?:conversation|call)(?: with (?:the )?(?:customer|client))?'
    r'|(?:connection|call) (?:with|to) (?:the )?(?:customer|client) (?:was |is )?(?:established|connected)'
    r'|(?:агент|оператор) клиентпен (?:сөйлесуге|әңгімеге) қосылды'
    r'|клиентпен байланыс орнатылды'
)
_RECORDING = _event_pattern(
    r'запись(?: и транскрибирование| и транскрипция)? (?:запущен[аы]|начат[аы]|возобновлен[аы]|началась)'
    r'|(?:call )?recording(?: and transcription)? (?:has |have |was |were )?(?:started|resumed)'
    r'|(?:жазу|жазба)(?: және транскрипция)? (?:қайта )?басталды'
)
_RECORDING_AFTER_CONNECTION = _event_pattern(
    r'запись(?: и транскрибирование| и транскрипция)? (?:запущен[аы]|начат[аы]|возобновлен[аы]|началась) '
    r'после (?:соединения|подключения)(?: (?:с клиентом|оператора))?'
    r'|(?:call )?recording(?: and transcription)? (?:has |have |was |were )?(?:started|resumed) '
    r'after (?:the )?(?:connection|call was connected|agent (?:joined|connected)|customer (?:joined|connected))'
    r'|(?:жазу|жазба)(?: және транскрипция)? (?:байланыс орнатылғаннан|қосылғаннан) кейін (?:қайта )?басталды'
)
_CLOSURES = (
    ('operator', 'closed', _event_pattern(
        r'(?:оператор|агент) (?:закрыл чат|завершил разговор|завершил звонок)'
        r'|(?:agent|operator) (?:has )?(?:closed (?:the )?chat|ended (?:the )?(?:call|conversation))'
        r'|(?:оператор|агент) (?:чатты жапты|әңгімені аяқтады|қоңырауды аяқтады)')),
    ('client', 'closed', _event_pattern(
        r'клиент (?:покинул чат|закрыл чат|завершил разговор|завершил звонок)'
        r'|(?:customer|client) (?:has )?(?:left (?:the )?chat|closed (?:the )?chat|ended (?:the )?(?:call|conversation))'
        r'|клиент (?:чаттан шықты|чатты жапты|әңгімені аяқтады|қоңырауды аяқтады)')),
    ('unknown', 'disconnected', _event_pattern(
        r'соединение с клиентом прервано'
        r'|(?:connection|call) (?:with|to) (?:the )?(?:customer|client) (?:was |is )?(?:lost|interrupted|disconnected)'
        r'|клиентпен байланыс үзілді')),
)
_GREETING = re.compile(
    r'\b(?:здравствуй(?:те)?|добрый\s+(?:день|вечер)|доброе\s+утро|привет|алло'
    r'|сәлем(?:етсіз(?:дер)?\s*(?:бе|ме))?|қайырлы\s+(?:таң|күн|кеш)'
    r'|hello|hi|hey|good\s+(?:morning|afternoon|evening)|greetings)\b', re.IGNORECASE)


def _normalized_event(text):
    return ' '.join(text.casefold().replace('ё', 'е').split())


def build_hints(conversation: Conversation | dict) -> dict:
    """Observe original turn order; missing evidence remains unknown.

    A response pause runs from the first unanswered client turn to the next
    operator turn. Bot/system turns neither answer for the operator nor reset
    the clock. It is contextual timing, not an automatic quality penalty.
    """
    if isinstance(conversation, dict):
        conversation = Conversation.model_validate(conversation)
    first_operator = None
    pending_client = None
    longest_pause = None
    identity_indices = []
    recording_indices = []
    recording_before_first_operator = False
    connected = False
    closure = None
    for turn in conversation.transcript:
        if turn.speaker == 'system':
            event = _normalized_event(turn.text)
            if _IDENTITY.fullmatch(event):
                identity_indices.append(turn.idx)
            if (_RECORDING_AFTER_CONNECTION.fullmatch(event)
                    or (connected and _RECORDING.fullmatch(event))):
                recording_indices.append(turn.idx)
            if _CONNECTION.fullmatch(event):
                connected = True
            for actor, reason, pattern in _CLOSURES:
                if pattern.fullmatch(event):
                    closure = {'actor': actor, 'turnIdx': turn.idx, 'reason': reason}
                    connected = False
                    break
        elif turn.speaker == 'client':
            if pending_client is None:
                pending_client = turn
        elif turn.speaker == 'operator':
            if first_operator is None:
                first_operator = turn
                # A later pause/resume cannot explain a greeting missing from
                # the first operator turn that was already recorded.
                recording_before_first_operator = bool(recording_indices)
            if pending_client is not None:
                seconds = turn.t_sec - pending_client.t_sec
                if isfinite(seconds) and seconds >= 0:
                    if longest_pause is None or seconds > longest_pause['seconds']:
                        longest_pause = {'clientIdx': pending_client.idx, 'operatorIdx': turn.idx,
                                         'seconds': round(seconds, 3)}
                pending_client = None
    greeting = bool(_GREETING.search(first_operator.text)) if first_operator is not None else None
    return {
        'firstOperatorIdx': first_operator.idx if first_operator is not None else None,
        'firstOperatorHasGreeting': greeting,
        'identityConfirmed': bool(identity_indices),
        'identityConfirmationIdxs': identity_indices,
        'longestClientOperatorPause': longest_pause,
        'closure': closure,
        'recordingAfterConnectionIdxs': recording_indices,
        'midRecordingCall': (conversation.channel == 'voice call' and first_operator is not None
                             and not greeting and recording_before_first_operator),
    }


@lru_cache(maxsize=1)
def _original_hashes():
    seed = json.loads(_SEED_PATH.read_text(encoding='utf-8'))
    return {item['id']: prepare_criterion(item)['contentHash'] for item in seed['criteria']}


def _is_original(criterion: Criterion | dict) -> bool:
    """A caller-supplied hash alone cannot activate an original-rule exception."""
    if isinstance(criterion, dict):
        try:
            criterion = Criterion.model_validate(criterion)
        except ValidationError:
            return False
    body = criterion.model_dump(by_alias=True)
    expected = _original_hashes().get(criterion.id)
    if expected is None or criterion.content_hash != expected:
        return False
    try:
        actual = prepare_criterion(body)['contentHash']
    except (ApiError, TypeError, ValueError):
        return False
    return actual == expected


def contact_na_allowed(conversation: Conversation | dict, criterion: Criterion | dict) -> bool:
    """The organizer's call exception belongs only to the unchanged seed rule."""
    try:
        if isinstance(conversation, dict):
            conversation = Conversation.model_validate(conversation)
        if isinstance(criterion, dict):
            criterion = Criterion.model_validate(criterion)
    except ValidationError:
        return False
    return (conversation.channel == 'voice call' and criterion.id == 'contact' and _is_original(criterion)
            and build_hints(conversation)['midRecordingCall'])


@lru_cache(maxsize=1)
def _canonical_contact():
    seed = json.loads(_SEED_PATH.read_text(encoding='utf-8'))
    return prepare_criterion(next(item for item in seed['criteria'] if item['id'] == 'contact'))


def contextual_na_criteria(conversation: Conversation | dict) -> list[str]:
    """Derived API hint; it does not mutate the original checklist or transcript."""
    return ['contact'] if contact_na_allowed(conversation, _canonical_contact()) else []


def contextual_na_metadata(conversation: Conversation | dict) -> dict:
    granted = contextual_na_criteria(conversation)
    return {'contextualNaCriteria': granted,
            'contextualNaCriterionHashes': {'contact': _canonical_contact()['contentHash']} if granted else {}}


def criterion_clarification(criterion: Criterion | dict) -> str:
    """Weight changes retain clarification; semantic edits and new rules do not."""
    if isinstance(criterion, dict):
        try:
            criterion = Criterion.model_validate(criterion)
        except ValidationError:
            return ''
    if not _is_original(criterion):
        return ''
    path = PROMPTS_DIR / f'{criterion.id}.md'
    return path.read_text(encoding='utf-8').strip() if path.is_file() else ''

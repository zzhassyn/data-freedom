"""Read-only, version-consistent cohorts shared by analytics and assistant tools."""
from __future__ import annotations

import hashlib
import json
import math
import re
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal, ROUND_HALF_UP

from .db import json_dumps
from .errors import ApiError
from .evaluations import is_evaluation_visible
from .extras import get_cached_summaries
from .read_views import latest_ready
from . import topics

LOW_SCORE = 70
MIN_COMPARISON_SAMPLE = 5
LIST_FILTERS = {
    'languages': {'RU', 'KZ', 'EN'},
    'channels': {'agent chat', 'voice call'},
    'status': {'new', 'done', 'running', 'failed', 'stale'},
    'attention': {'gross', 'review'},
    'appealStatus': {'none', 'open', 'resolved'},
}
FILTER_KEYS = set(LIST_FILTERS) | {'q', 'groupId', 'checklistId', 'scoreFrom', 'scoreTo',
    'dateFrom', 'dateTo', 'timezoneOffsetMinutes', 'conversationIds'}


def _invalid(message):
    raise ApiError('invalid_filter', message, 400)


def _list(value, key):
    if value is None:
        value = []
    if isinstance(value, str):
        if value.lstrip().startswith('['):
            try:
                value = json.loads(value)
            except (ValueError, TypeError):
                _invalid('Не удалось прочитать выбранные обращения')
        else:
            value = value.split(',') if value else []
    if not isinstance(value, (list, tuple)) or any(not isinstance(item, str) for item in value):
        _invalid('Некорректный список условий фильтра')
    result = list(dict.fromkeys(item.strip() for item in value if item.strip()))
    if key == 'conversationIds':
        if len(result) > 2000 or any(len(item) > 256 for item in result):
            _invalid('В выборке слишком много обращений')
    elif not set(result) <= LIST_FILTERS[key]:
        _invalid('Неизвестное условие фильтра')
    return result


def normalize_filters(raw=None):
    """Normalize browser query strings and structured assistant scopes identically."""
    if raw is None:
        raw = {}
    if not isinstance(raw, dict) or set(raw) - FILTER_KEYS:
        _invalid('Неизвестное условие фильтра')
    result = {}
    for key in LIST_FILTERS:
        value = _list(raw.get(key, []), key)
        if value:
            result[key] = value
    if 'conversationIds' in raw and raw['conversationIds'] is not None:
        result['conversationIds'] = _list(raw['conversationIds'], 'conversationIds')
    for key in ('q', 'groupId', 'checklistId'):
        value = raw.get(key)
        if value is None or value == '':
            continue
        if not isinstance(value, str) or len(value) > (2000 if key == 'q' else 256):
            _invalid('Некорректное условие поиска')
        if value.strip():
            result[key] = value.strip()
    for key in ('scoreFrom', 'scoreTo'):
        value = raw.get(key)
        if value is None or value == '':
            continue
        try:
            if isinstance(value, bool):
                raise ValueError()
            value = float(value)
        except (ValueError, TypeError):
            _invalid('Баллы должны быть числом от 0 до 100')
        if not math.isfinite(value) or not 0 <= value <= 100:
            _invalid('Баллы должны быть числом от 0 до 100')
        result[key] = value
    if result.get('scoreFrom', 0) > result.get('scoreTo', 100):
        _invalid('Начальный балл не может быть больше конечного')
    for key in ('dateFrom', 'dateTo'):
        value = raw.get(key)
        if value is None or value == '':
            continue
        try:
            if not isinstance(value, str) or date.fromisoformat(value).isoformat() != value:
                raise ValueError()
        except (ValueError, TypeError):
            _invalid('Укажите дату в формате ГГГГ-ММ-ДД')
        result[key] = value
    if result.get('dateFrom', '') > result.get('dateTo', '9999-12-31'):
        _invalid('Начальная дата не может быть позже конечной')
    value = raw.get('timezoneOffsetMinutes', 0)
    try:
        if isinstance(value, bool):
            raise ValueError()
        offset = int(value)
        if float(value) != offset or not -840 <= offset <= 840:
            raise ValueError()
    except (TypeError, ValueError, OverflowError):
        _invalid('Некорректный часовой пояс для выбранных дат')
    result['timezoneOffsetMinutes'] = offset
    return result


def _datetime(value):
    try:
        parsed = datetime.fromisoformat(value.replace('Z', '+00:00'))
        return parsed.replace(tzinfo=timezone.utc) if parsed.tzinfo is None else parsed.astimezone(timezone.utc)
    except (AttributeError, ValueError, TypeError):
        return None


def _date_source(conversation):
    stored = _datetime(conversation.get('startedAt'))
    if not stored:
        return 'unknown'
    first = (conversation.get('transcript') or [{}])[0].get('timestamp', '')
    source = _datetime(first) if 'T' in first else None
    if source:
        # startedAt is intentionally stable across imports, even if a later
        # transcript adds or changes its date. Do not relabel an import date.
        return 'conversation' if source.isoformat(timespec='milliseconds') == stored.isoformat(timespec='milliseconds') else 'unknown'
    return 'imported'


def _bounds(filters):
    offset = timedelta(minutes=filters['timezoneOffsetMinutes'])
    lower = upper = None
    try:
        if filters.get('dateFrom'):
            lower = datetime.combine(date.fromisoformat(filters['dateFrom']), time(), timezone.utc) + offset
        if filters.get('dateTo'):
            upper = datetime.combine(date.fromisoformat(filters['dateTo']) + timedelta(days=1), time(), timezone.utc) + offset
    except OverflowError:
        _invalid('Выбранная дата выходит за допустимый диапазон')
    return lower, upper


def _mean(values, rounded=False):
    if not values:
        return None
    result = sum((Decimal(str(value)) for value in values), Decimal(0)) / len(values)
    return float(result.quantize(Decimal('.01'), rounding=ROUND_HALF_UP) if rounded else result)


def _snapshot(app):
    db = app.state.db
    with db.read_connection() as conn:
        conversations = db.all_conversations(conn)
        evaluations = db.all_evaluations(conn)
        checklists = db.all_checklists(conn)
        appeals = db.all_appeals(conn)
        summaries = get_cached_summaries(db, conversations, conn)
        assignments = topics.assignments(app, conversations, conn)
        catalog = topics.catalog(db, conn)
        audio = [dict(row) for row in conn.execute(
            'SELECT conversation_id,transcript_hash,audio_seconds_declared,audio_seconds_decoded '
            'FROM transcriptions').fetchall()]
    return {'conversations': conversations, 'evaluations': evaluations, 'checklists': checklists,
            'appeals': appeals, 'summaries': summaries, 'topicAssignments': assignments,
            'topicCatalog': catalog, 'audio': {row['conversation_id']: row for row in audio}}


_HIDDEN = re.compile(r'\[(?:имя скрыто|персональные данные скрыты|аты[\s-]*жөні жасырылған|'
    r'аты жасырылған|есімі жасырылған|жеке (?:деректер|мәліметтер) жасырылған|'
    r'name (?:hidden|redacted)|personal (?:data|information) (?:hidden|redacted))\]', re.I)
_NAME = r'([A-ZА-ЯЁӘҒҚҢӨҰҮҺІ][a-zа-яёәғқңөұүһі]+)'
_NAME_PATTERNS = [
    (re.compile(r'[Мм]еня зовут\s+' + _NAME), False),
    (re.compile(r'[Мм]енің атым\s+' + _NAME), False),
    (re.compile(r'[Mm]y name is\s+' + _NAME), False),
    (re.compile(r'\bI[\'’]m\s+' + _NAME), False),
    (re.compile(r'\b[Яя]\s+' + _NAME), False),
    (re.compile(r'\b[Мм]ен\s+' + _NAME), True),
]


def _operator(conversation, summary):
    turns = [turn for turn in conversation['transcript'] if turn['speaker'] == 'operator']
    if not turns:
        return {'kind': 'botOnly', 'name': None, 'id': 'botOnly'}
    name = summary.get('operatorName') if summary else None
    if not (isinstance(name, str) and name.strip() and len(name) <= 100
            and not any(char in name for char in '[*]')
            and any(name.casefold() in turn['text'].casefold() for turn in turns)):
        name = None
    if not name:
        for pattern, kazakh in _NAME_PATTERNS:
            hit = pattern.search(turns[0]['text'])
            if not hit or hit.group(1) in {'Вам', 'Вас', 'Вы', 'Сейчас', 'Сіз', 'Сізге'}:
                continue
            name = hit.group(1)
            if kazakh:
                name = re.sub(r'(мын|мін|пын|пін|бын|бін)$', '', name)
            if len(name) > 1:
                break
            name = None
    if name:
        name = ' '.join(name.split())
        return {'kind': 'named', 'name': name, 'id': 'name:' + name.casefold()}
    kind = 'hidden' if any(_HIDDEN.search(turn['text']) for turn in turns) else 'missing'
    return {'kind': kind, 'name': None, 'id': kind}


def _row(conversation, ready, latest, checklist, appeals, summary, assignment, titles):
    cid = conversation['id']
    if latest is None:
        status = 'new'
    elif latest.get('transcriptHash') != conversation.get('transcriptHash'):
        status = 'stale'
    else:
        status = 'running' if latest['status'] in ('queued', 'running') else latest['status']
    counts = {'open': 0, 'resolved': 0}
    for appeal in appeals:
        counts['open' if appeal['status'] == 'open' else 'resolved'] += 1
    topic_id = assignment.get('topicId') if assignment else None
    topic_id = topic_id if topic_id in titles else None
    operator = _operator(conversation, summary)
    selected = ready or latest
    return {'conversationId': cid, 'number': conversation.get('number'), 'startedAt': conversation.get('startedAt'),
        'dateSource': _date_source(conversation), 'language': conversation['language'], 'channel': conversation['channel'],
        'preview': next((t['text'][:140] for t in conversation['transcript'] if t['speaker'] == 'client'), ''),
        'topicId': topic_id, 'topic': titles.get(topic_id),
        'resolutionStatus': assignment.get('resolutionStatus', 'unknown') if assignment else 'unknown',
        'operatorName': operator['name'], 'operatorKind': operator['kind'], 'operatorId': operator['id'],
        'checklistId': checklist['id'], 'checklistVersion': checklist['version'],
        'evaluationId': selected['id'] if selected else None, 'qualityEvaluationId': ready['id'] if ready else None,
        'latestEvaluationId': latest['id'] if latest else None, 'status': status,
        'latestAttemptStatus': latest['status'] if latest else None,
        'readyIsPreviousAttempt': bool(ready and latest and ready['id'] != latest['id']),
        'total': ready.get('total') if ready else None, 'originalTotal': ready.get('originalTotal') if ready else None,
        'grossFlagged': bool(ready and ready.get('grossError', {}).get('flagged')),
        'needsReviewCount': ready.get('needsReviewCount', 0) if ready else 0,
        'openAppeals': counts['open'], 'decidedAppeals': counts['resolved']}


def _matches(conversation, row, summary, filters, bounds):
    if 'conversationIds' in filters and conversation['id'] not in filters['conversationIds']:
        return False
    if filters.get('groupId') and conversation['datasetGroupId'] != filters['groupId']:
        return False
    for key, field in (('languages', 'language'), ('channels', 'channel'), ('status', 'status')):
        if filters.get(key) and row[field] not in filters[key]:
            return False
    if filters.get('q'):
        haystack = '\n'.join([conversation['id'], str(conversation.get('number', '')),
            *(turn['text'] for turn in conversation['transcript']),
            *(str(summary.get(k, '')) for k in ('topic', 'request', 'outcome'))] if summary else
            [conversation['id'], str(conversation.get('number', '')), *(turn['text'] for turn in conversation['transcript'])])
        if filters['q'].casefold() not in haystack.casefold():
            return False
    if 'scoreFrom' in filters or 'scoreTo' in filters:
        if row['total'] is None or not filters.get('scoreFrom', 0) <= row['total'] <= filters.get('scoreTo', 100):
            return False
    if any(bounds):
        instant = _datetime(row['startedAt'])
        if instant is None or (bounds[0] and instant < bounds[0]) or (bounds[1] and instant >= bounds[1]):
            return False
    if filters.get('attention') and not any(
        row['grossFlagged'] if value == 'gross' else row['needsReviewCount'] > 0 for value in filters['attention']):
        return False
    if filters.get('appealStatus') and not any(
        not (row['openAppeals'] or row['decidedAppeals']) if value == 'none' else
        row['openAppeals'] > 0 if value == 'open' else row['decidedAppeals'] > 0
        for value in filters['appealStatus']):
        return False
    return True


def _select(snapshot, filters):
    checklist_id = filters.get('checklistId', 'active')
    checklist = next((cl for cl in snapshot['checklists']
        if (cl['isActive'] if checklist_id == 'active' else cl['id'] == checklist_id)), None)
    if checklist is None:
        raise ApiError('not_found', 'Чек-лист не найден', 404)
    filters = {**filters, 'checklistId': checklist['id']}
    all_conversations = {conv['id']: conv for conv in snapshot['conversations']}
    visible = [ev for ev in snapshot['evaluations'] if ev['checklistId'] == checklist['id'] and is_evaluation_visible(ev)]
    ready = {ev['conversationId']: ev for ev in latest_ready(visible, all_conversations, checklist['id'])}
    latest = {}
    evaluation_to_conversation = {}
    for ev in visible:
        latest.setdefault(ev['conversationId'], ev)
        evaluation_to_conversation[ev['id']] = ev['conversationId']
    for ev in snapshot['evaluations']:
        if not is_evaluation_visible(ev):
            continue
        cid = ev['conversationId']
        if cid not in ready and ev.get('status') == 'done' and cid in all_conversations:
            conv = all_conversations[cid]
            if ev.get('transcriptHash') == conv.get('transcriptHash'):
                ready[cid] = ev
        if cid not in latest and cid in all_conversations:
            latest[cid] = ev
            evaluation_to_conversation[ev['id']] = cid
    appeals_by_conversation = {}
    for appeal in snapshot['appeals']:
        cid = evaluation_to_conversation.get(appeal['evaluationId'])
        if cid:
            appeals_by_conversation.setdefault(cid, []).append(appeal)
    titles = {item['id']: item['title'] for item in snapshot['topicCatalog']}
    bounds = _bounds(filters)
    conversations, rows = [], []
    for conversation in sorted(snapshot['conversations'], key=lambda conv: (conv.get('number', 0), conv['id'])):
        cid = conversation['id']
        summary, assignment = snapshot['summaries'].get(cid), snapshot['topicAssignments'].get(cid)
        row = _row(conversation, ready.get(cid), latest.get(cid), checklist,
                   appeals_by_conversation.get(cid, []), summary, assignment, titles)
        if _matches(conversation, row, summary, filters, bounds):
            conversations.append(conversation)
            rows.append(row)
    ids = {conv['id'] for conv in conversations}
    selected_appeals = sorted((ap for cid in ids for ap in appeals_by_conversation.get(cid, [])), key=lambda ap: ap['id'])
    cohort = {'filters': filters, 'checklist': checklist, 'checklists': snapshot['checklists'],
        'conversations': conversations, 'rows': rows, 'evaluations': {cid: ready[cid] for cid in ids if cid in ready},
        'latestEvaluations': {cid: latest[cid] for cid in ids if cid in latest}, 'appeals': selected_appeals,
        'summaries': {cid: snapshot['summaries'][cid] for cid in ids if cid in snapshot['summaries']},
        'topicAssignments': {cid: snapshot['topicAssignments'][cid] for cid in ids if cid in snapshot['topicAssignments']},
        'topicCatalog': snapshot['topicCatalog'], '_snapshot': snapshot}
    # The same snapshot supplies previous-period facts and call durations too.
    # Bind those inputs, not just the current selected rows, for assistant checks.
    cohort['sourceHash'] = hashlib.sha256(json_dumps({'filters': filters, 'snapshot': snapshot}).encode('utf-8')).hexdigest()
    return cohort


def load_cohort(app, filters=None):
    return _select(_snapshot(app), normalize_filters(filters))


def _criterion_cell(criterion, rows, evaluations):
    values, present, applicable, na, below, flagged = [], [], [], [], [], []
    answer_ids = {key: [] for key in ('yes', 'partial', 'no', 'na')}
    for row in rows:
        ev = evaluations.get(row['conversationId'])
        if not ev:
            continue
        item = next((it for it in ev['items'] if it['criterionId'] == criterion['id'] and it.get('status') == 'done'), None)
        if item is None or item.get('answer') is None:
            continue
        cid = row['conversationId']
        present.append(cid)
        if item['answer'] == 'na':
            na.append(cid)
            answer_ids['na'].append(cid)
            continue
        applicable.append(cid)
        if criterion['type'] == 'scale':
            maximum = max(step['value'] for step in criterion['scale'])
            bucket = 'yes' if item['answer'] == maximum else 'partial' if item['answer'] > 0 else 'no'
        else:
            bucket = item['answer']
        answer_ids[bucket].append(cid)
        if criterion['type'] == 'flag':
            if item['answer'] == 'yes':
                flagged.append(cid)
                below.append(cid)
        else:
            value = (item['answer'] / max(step['value'] for step in criterion['scale'])
                     if criterion['type'] == 'scale' else float(item['answer'] == 'yes'))
            values.append(value)
            if value < 1:
                below.append(cid)
    return {'total': len(rows), 'evaluated': sum(row['conversationId'] in evaluations for row in rows),
        'assessed': len(present), 'applicable': len(applicable), 'na': len(na),
        'missing': len(rows) - len(present),
        'answerCounts': {key: len(ids) for key, ids in answer_ids.items()}, 'answerIds': answer_ids,
        'avgFraction': _mean(values), 'belowTargetCount': len(below), 'flaggedCount': len(flagged),
        'conversationIds': present, 'belowTargetIds': below}


def _criteria(cohort, rows=None, *, languages=True):
    rows = cohort['rows'] if rows is None else rows
    sections = {section['id']: section for section in cohort['checklist']['sections']}
    result = []
    for criterion in sorted(cohort['checklist']['criteria'], key=lambda c: c['order']):
        section = sections[criterion['sectionId']]
        row = {'id': criterion['id'], 'title': criterion['title'], 'type': criterion['type'],
               'sectionId': section['id'], 'sectionTitle': section['title'],
               'sectionOrder': section['order'], 'order': criterion['order'],
               **_criterion_cell(criterion, rows, cohort['evaluations'])}
        if languages:
            row['byLanguage'] = {language: _criterion_cell(criterion,
                [item for item in rows if item['language'] == language], cohort['evaluations'])
                for language in ('RU', 'KZ', 'EN')}
        result.append(row)
    return result


def _topic_report(cohort, job):
    groups = {}
    unidentified = 0
    for row in cohort['rows']:
        cid = row['conversationId']
        if cid not in cohort['topicAssignments']:
            continue
        if not row['topicId']:
            unidentified += 1
            continue
        group = groups.setdefault(row['topicId'], {'id': row['topicId'], 'topic': row['topic'], 'rows': []})
        group['rows'].append(row)
    result = []
    for group in groups.values():
        rows = group['rows']
        states = {status: [row['conversationId'] for row in rows if row['resolutionStatus'] == status]
                  for status in ('resolved', 'unresolved', 'unknown')}
        known = len(states['resolved']) + len(states['unresolved'])
        scores = [row['total'] for row in rows if row['total'] is not None]
        result.append({'id': group['id'], 'topic': group['topic'], 'count': len(rows),
            **{status: len(ids) for status, ids in states.items()}, 'known': known,
            'resolutionRate': len(states['resolved']) / known if known else None,
            'avgScore': _mean(scores, True), 'evaluated': sum(row['qualityEvaluationId'] is not None for row in rows),
            'scoredCount': len(scores),
            'conversationIds': [row['conversationId'] for row in rows],
            **{status + 'Ids': ids for status, ids in states.items()}, 'isRare': len(rows) < topics.MIN_COUNT})
    result.sort(key=lambda row: (-row['unresolved'], -row['count'], row['topic']))
    analyzed = len(cohort['topicAssignments'])
    selected_ids = {row['conversationId'] for row in cohort['rows']}
    # Progress describes the running background task, which can have a different
    # scope. Never leak unrelated IDs through a report's selected cohort.
    public_job = {key: job.get(key) for key in ('status', 'phase', 'total', 'processed', 'failed', 'pending',
                  'skipped', 'error', 'usageIncomplete') if key in job}
    public_job.update(scope='global', selectedCount=len(selected_ids & set(job.get('conversationIds', []))))
    return {'analyzed': analyzed, 'pending': len(cohort['rows']) - analyzed, 'unidentified': unidentified,
            'minCount': topics.MIN_COUNT, 'job': public_job, 'rows': result}


def _operators(cohort):
    groups = {}
    for row in cohort['rows']:
        groups.setdefault(row['operatorId'], []).append(row)
    result = []
    for key, rows in groups.items():
        scores = [row['total'] for row in rows if row['total'] is not None]
        weak = [row for row in _criteria(cohort, rows, languages=False)
                if row['type'] != 'flag' and row['belowTargetCount']]
        weak.sort(key=lambda row: (-row['belowTargetCount'], row['avgFraction'], row['title']))
        result.append({'id': key, 'name': rows[0]['operatorName'], 'kind': rows[0]['operatorKind'],
            'count': len(rows), 'evaluated': sum(row['qualityEvaluationId'] is not None for row in rows),
            'scoredCount': len(scores), 'avgScore': _mean(scores, True),
            'grossCount': sum(row['grossFlagged'] for row in rows),
            'lowScoreCount': sum(value < LOW_SCORE for value in scores),
            'conversationIds': [row['conversationId'] for row in rows], 'weakCriteria': weak[:3],
            'identityVerified': False, 'smallSample': len(scores) < MIN_COMPARISON_SAMPLE})
    order = {'named': 0, 'hidden': 1, 'missing': 2, 'botOnly': 3}
    return sorted(result, key=lambda row: (order[row['kind']], -row['count'], row['name'] or ''))


def _duration(cohort):
    values, audio_n, timestamp_n = [], 0, 0
    for conversation in cohort['conversations']:
        if conversation['channel'] != 'voice call':
            continue
        audio = cohort['_snapshot']['audio'].get(conversation['id'], {})
        value = None
        if audio.get('transcript_hash') == conversation.get('transcriptHash'):
            for key in ('audio_seconds_declared', 'audio_seconds_decoded'):
                candidate = audio.get(key)
                if isinstance(candidate, (float, int)) and math.isfinite(candidate) and candidate > 0:
                    value = candidate
                    break
        if value is not None:
            audio_n += 1
        else:
            times = [turn.get('tSec') for turn in conversation['transcript']]
            times = [t for t in times if isinstance(t, (float, int)) and math.isfinite(t)]
            if times and max(times) > min(times):
                value = max(times) - min(times)
                timestamp_n += 1
        if value is not None:
            values.append(value)
    return {'averageSeconds': _mean(values, True), 'count': len(values),
            'source': 'audio_and_transcript' if audio_n and timestamp_n else 'audio' if audio_n else 'transcript' if timestamp_n else None,
            'audioCount': audio_n, 'timestampCount': timestamp_n}


def _period(cohort):
    filters = cohort['filters']
    def summary(value):
        values = [row['total'] for row in value['rows'] if row['total'] is not None]
        return {'dateFrom': value['filters'].get('dateFrom'), 'dateTo': value['filters'].get('dateTo'),
                'count': len(value['rows']), 'evaluated': sum(row['qualityEvaluationId'] is not None for row in value['rows']),
                'scoredCount': len(values), 'avgScore': _mean(values, True),
                'conversationIds': [row['conversationId'] for row in value['rows']]}
    current = summary(cohort)
    result = {'available': False, 'reason': 'period_not_selected', 'current': current, 'previous': None, 'deltaScore': None}
    if not (filters.get('dateFrom') and filters.get('dateTo')):
        return result
    begin, end = date.fromisoformat(filters['dateFrom']), date.fromisoformat(filters['dateTo'])
    try:
        previous_end = begin - timedelta(days=1)
        previous_start = begin - timedelta(days=(end - begin).days + 1)
    except OverflowError:
        return result
    previous = _select(cohort['_snapshot'], {**filters, 'dateFrom': previous_start.isoformat(), 'dateTo': previous_end.isoformat()})
    result['previous'] = summary(previous)
    if any(row['dateSource'] != 'conversation' for row in cohort['rows'] + previous['rows']):
        result['reason'] = 'import_dates'
    elif min(current['scoredCount'], result['previous']['scoredCount']) < MIN_COMPARISON_SAMPLE:
        result['reason'] = 'insufficient_data'
    else:
        result.update(available=True, reason=None,
            deltaScore=float(Decimal(str(current['avgScore'])) - Decimal(str(result['previous']['avgScore']))))
    return result


def build_report(app, filters=None, *, cohort=None):
    cohort = load_cohort(app, filters) if cohort is None else cohort
    rows = cohort['rows']
    choose = lambda predicate: [row['conversationId'] for row in rows if predicate(row)]
    drills = {
        'evaluated': choose(lambda row: row['qualityEvaluationId'] is not None),
        'unevaluated': choose(lambda row: row['qualityEvaluationId'] is None),
        'lowScore': choose(lambda row: row['total'] is not None and row['total'] < LOW_SCORE),
        'gross': choose(lambda row: row['grossFlagged']),
        'review': choose(lambda row: row['needsReviewCount'] > 0),
        'openAppeals': choose(lambda row: row['openAppeals'] > 0),
        'unresolved': choose(lambda row: row['resolutionStatus'] == 'unresolved'),
        'failed': choose(lambda row: row['status'] == 'failed'),
        'pending': choose(lambda row: row['status'] == 'running'),
    }
    attention = set().union(*(set(drills[key]) for key in ('lowScore', 'gross', 'review', 'openAppeals', 'unresolved', 'failed')))
    drills['attention'] = choose(lambda row: row['conversationId'] in attention)
    topic_data = _topic_report(cohort, topics.read_job(app.state.db))
    coverage = {'evaluated': len(drills['evaluated']), 'unevaluated': len(drills['unevaluated']),
        'pending': len(drills['pending']), 'failed': len(drills['failed']),
        'stale': sum(row['status'] == 'stale' for row in rows),
        'readyWithNewerAttempt': sum(row['readyIsPreviousAttempt'] for row in rows),
        'topicsAnalyzed': topic_data['analyzed'], 'topicsPending': topic_data['pending'], 'topicsUnidentified': topic_data['unidentified']}
    scores = [row['total'] for row in rows if row['total'] is not None]
    checklist = cohort['checklist']
    evaluation_conversations = {evaluation['id']: evaluation['conversationId']
                               for evaluation in cohort['_snapshot']['evaluations']}
    appeal_ids = {status: {evaluation_conversations[appeal['evaluationId']] for appeal in cohort['appeals']
                          if appeal['status'] == status} for status in ('open', 'confirmed', 'changed')}
    all_appeal_ids = set().union(*appeal_ids.values())
    appeals = {'total': len(cohort['appeals']), 'conversationIds': choose(lambda row: row['conversationId'] in all_appeal_ids),
              **{status: sum(appeal['status'] == status for appeal in cohort['appeals']) for status in appeal_ids},
              **{status + 'Ids': choose(lambda row: row['conversationId'] in ids) for status, ids in appeal_ids.items()}}
    return {'sourceHash': cohort['sourceHash'], 'scope': {'filters': cohort['filters'],
        'checklist': {key: checklist[key] for key in ('id', 'version', 'name')},
        'checklists': [{key: cl[key] for key in ('id', 'version', 'name', 'isActive')}
                       for cl in sorted(cohort['checklists'], key=lambda cl: cl['version'], reverse=True)],
        'total': len(rows), 'conversationIds': choose(lambda row: True),
        'dateSourceCounts': {source: sum(row['dateSource'] == source for row in rows) for source in ('conversation', 'imported', 'unknown')},
        'qualityBasis': 'latest_completed_current_transcript'}, 'coverage': coverage,
        'overview': {'avgScore': _mean(scores, True), 'scoredCount': len(scores), 'lowScoreThreshold': LOW_SCORE,
            'lowScoreCount': len(drills['lowScore']), 'grossCount': len(drills['gross']), 'reviewCount': len(drills['review']),
            'openAppealCount': sum(row['openAppeals'] for row in rows), 'openAppealConversations': len(drills['openAppeals']),
            'appeals': appeals,
            'attentionCount': len(drills['attention']), 'unresolvedCount': len(drills['unresolved']),
            'callDuration': _duration(cohort), 'drilldowns': drills},
        'criteria': _criteria(cohort), 'topics': topic_data, 'operators': _operators(cohort),
        'periodComparison': _period(cohort), 'conversations': rows}

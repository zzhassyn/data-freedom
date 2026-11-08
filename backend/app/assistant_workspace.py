"""A grounded, read-only assistant with global access and optional page focus."""
from __future__ import annotations

import asyncio
from copy import deepcopy
import hashlib
import json
import re
import time
from typing import Annotated, Literal
from uuid import uuid4

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse
from pydantic import ConfigDict, Field, StrictInt, ValidationError

from . import llm_switch
from .checklists import DIFF_FIELDS
from .db import json_dumps, utcnow
from .errors import ApiError, JudgeError
from .evaluations import public_evaluation
from .extras import AssistantMessage, AssistantRequest, _assistant_context
from .models import ApiModel, Usage

router = APIRouter(prefix='/api')
MAX_ROUNDS = 3
TOTAL_TIMEOUT = 240
MAX_READ_CONVERSATIONS = 5
MAX_TRANSCRIPT_CHARS = 45000
_HTML = re.compile(r'<\s*(?:/?[A-Za-z][^>]*|![^>]*|\?[^>]*)>', re.I)


class SelectedContext(ApiModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)
    conversation_id: str = Field(min_length=1, max_length=128)
    transcript_hash: str = Field(min_length=1, max_length=128)
    evaluation_id: str | None = Field(default=None, min_length=1, max_length=128)


class SelectedComparison(ApiModel):
    model_config = ConfigDict(extra='forbid')
    from_version: StrictInt = Field(ge=1)
    to_version: StrictInt = Field(ge=1)


class WorkspaceFocus(ApiModel):
    model_config = ConfigDict(extra='forbid')
    conversation: SelectedContext | None = None
    comparison: SelectedComparison | None = None
    filters: dict = Field(default_factory=dict)


class WorkspaceRequest(ApiModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)
    message: str = Field(min_length=1, max_length=2000)
    history: list[AssistantMessage] = Field(default_factory=list, max_length=12)
    language: Literal['RU', 'KZ', 'EN'] = 'RU'
    focus: WorkspaceFocus | None = None
    # Previous clients still supply these fields; they are optional focus only.
    scope: dict = Field(default_factory=dict)
    context: SelectedContext | None = None
    comparison: SelectedComparison | None = None


class SearchFilter(ApiModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)
    field: Literal['scoreFrom', 'scoreTo', 'dateFrom', 'dateTo', 'languages',
                   'channels', 'status', 'attention', 'appealStatus']
    value: str = Field(min_length=1, max_length=200)


class ToolCall(ApiModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)
    name: Literal['search_conversations', 'read_conversations', 'quality_overview',
                  'topic_breakdown', 'compare_checklists']
    use_focus: bool = False
    query: str = Field(max_length=200)
    filters: list[SearchFilter] = Field(max_length=10)
    conversation_ids: list[str] = Field(max_length=3)
    criterion_id: str | None
    topic_id: str | None
    resolution_status: Literal['all', 'resolved', 'unresolved', 'unknown']
    limit: StrictInt = Field(ge=1, le=15)
    from_version: StrictInt | None = Field(ge=1)
    to_version: StrictInt | None = Field(ge=1)


class CitationReference(ApiModel):
    model_config = ConfigDict(extra='forbid')
    source_id: str
    turn_idx: StrictInt = Field(ge=0)
    quote: str = Field(min_length=1, max_length=500)


class FactAudit(ApiModel):
    model_config = ConfigDict(extra='forbid')
    unanswered_questions: list[Annotated[str, Field(max_length=500)]] = Field(max_length=8)
    unsupported_draft_claims: list[Annotated[str, Field(max_length=500)]] = Field(max_length=8)
    attribution_corrections: list[Annotated[str, Field(max_length=500)]] = Field(max_length=8)


class Step(ApiModel):
    model_config = ConfigDict(extra='forbid')
    fact_audit: FactAudit | None = None
    answer: str = Field(max_length=8000)
    tool_calls: list[ToolCall] = Field(max_length=3)
    source_ids: list[str] = Field(max_length=10)
    action_ids: list[str] = Field(max_length=6)
    citations: list[CitationReference] = Field(max_length=8)


def _hash(value):
    return hashlib.sha256(json_dumps(value).encode('utf-8')).hexdigest()


def _label(language, ru, kk, en):
    return {'RU': ru, 'KZ': kk, 'EN': en}[language]


def assistant_usage_incomplete(db, conn=None):
    """Known model_calls totals never conceal sent attempts lacking a receipt."""
    return any(item['body'].get('requestSent') and not item['body'].get('usageKnown')
               for item in db.get_caches('assistant_attempt', conn).values())


class AttemptLedger:
    def __init__(self, db):
        self.db, self.run_id, self.ids = db, uuid4().hex, []

    def callback(self, round_number):
        attempt_id = f'{self.run_id}:{round_number}'
        started = time.monotonic()

        def update(event):
            if event['stage'] == 'sending':
                with self.db.transaction() as conn:
                    if self.db.get_cache('assistant_attempt', attempt_id, conn):
                        raise JudgeError('Повторный вызов ассистента не разрешён')
                    self.db.set_cache('assistant_attempt', attempt_id, {
                        'runId': self.run_id, 'round': round_number, 'requestSent': True,
                        'usageKnown': False, 'usageRecorded': False, 'status': 'sending',
                        'model': event.get('model'), 'startedAt': utcnow()}, conn=conn)
                self.ids.append(attempt_id)
                return
            if event['stage'] != 'finished':
                raise JudgeError('Некорректное состояние запроса ассистента')
            usage = event.get('usage')
            usage = Usage.model_validate(usage).model_dump(by_alias=True) if usage is not None else None
            with self.db.transaction() as conn:
                saved = self.db.get_cache('assistant_attempt', attempt_id, conn)
                if not saved:
                    raise JudgeError('Не найден учёт запроса ассистента')
                body = saved['body']
                if body.get('status') != 'sending':
                    return  # A callback cannot charge the same received round twice.
                if usage is not None and not body.get('usageRecorded'):
                    self.db.record_usage(usage, int((time.monotonic() - started) * 1000),
                                         kind='assistant', conn=conn)
                body.update(status=event['status'], usageKnown=usage is not None,
                            usageRecorded=usage is not None, finishedAt=utcnow(),
                            provider=event.get('provider'))
                self.db.set_cache('assistant_attempt', attempt_id, body, usage, conn)
        return update

    def public_usage(self):
        values = [self.db.get_cache('assistant_attempt', key) for key in self.ids]
        known = [row['usage'] for row in values if row and row['body'].get('usageKnown')]
        return {
            'usage': {'inputTokens': sum(row.get('inputTokens', 0) for row in known),
                      'outputTokens': sum(row.get('outputTokens', 0) for row in known),
                      'costUsd': sum(row.get('costUsd', 0) for row in known), 'calls': len(values)},
            'usageIncomplete': any(not row or not row['body'].get('usageKnown') for row in values),
        }


def _bounded_history(messages):
    result, remaining = [], 20000
    for message in reversed(messages):
        if remaining <= 0:
            break
        content = message.content[-remaining:]
        result.append({'role': message.role, 'content': content})
        remaining -= len(content)
    return list(reversed(result))


class Workspace:
    def __init__(self, app, body):
        from .analytics import _select, build_report, load_cohort, normalize_filters

        self.app, self.body = app, body
        self.sources, self.actions, self.source_data = {}, {}, {}
        self.source_checks, self.action_sources = {}, {}
        self.read_ids, self.transcript_chars = set(), 0
        self.context_body, self.context_fingerprint, self.context_source = None, None, None
        self.compare_fingerprints = {}
        self.focus = body.focus or WorkspaceFocus(conversation=body.context,
            comparison=body.comparison, filters=body.scope)
        if len(self.focus.filters) > 20:
            raise ApiError('invalid_filter', 'Слишком много условий выборки', 400)
        if self.focus.conversation:
            selected = self.focus.conversation
            self.context_body = AssistantRequest(message=body.message, history=body.history,
                language=body.language, transcript_hash=selected.transcript_hash,
                evaluation_id=selected.evaluation_id)
            try:
                conversation, assessment, fingerprint = _assistant_context(
                    app.state.db, selected.conversation_id, self.context_body)
            except ApiError as exc:
                if exc.code == 'stale_source':
                    raise ApiError('assistant_focus_stale',
                        'Контекст обращения изменился. Обновите данные и повторите вопрос', 409) from exc
                raise
            self.context_fingerprint = fingerprint
            self.context_source = (conversation.model_dump(by_alias=True), assessment)
        self.cohort = load_cohort(app, {})
        self.report = build_report(app, {}, cohort=self.cohort)
        self.scope = self.cohort['filters']
        self.source_hash = self.cohort['sourceHash']
        self.conversations = {item['id']: item for item in self.cohort['conversations']}
        self.rows = {item['conversationId']: item for item in self.cohort['rows']}
        self.focus_cohort = (_select(self.cohort['_snapshot'], normalize_filters(self.focus.filters))
                             if self.focus.filters else self.cohort)
        self.focus_report = (build_report(app, self.focus.filters, cohort=self.focus_cohort)
                             if self.focus.filters else self.report)
        self.ledger = AttemptLedger(app.state.db)

    def semantic(self, value):
        """Compare supplied meaning, not cache bills, timestamps or generated IDs."""
        if isinstance(value, list):
            return [self.semantic(item) for item in value]
        if not isinstance(value, dict):
            return value
        result = {}
        for key, item in value.items():
            if key in {'sourceId', 'sourceHash', 'usage', 'latencyMs', 'updatedAt'}:
                continue
            if key == 'actionId' or key.endswith('ActionId'):
                action = self.actions.get(item) if isinstance(item, str) else None
                result[key] = self.semantic({k: v for k, v in action.items() if k != 'id'}) if action else None
            else:
                result[key] = self.semantic(item)
        return result

    def bind_source(self, sid, recipe, value, dependencies=()):
        self.source_checks[sid] = {'recipe': recipe, 'fingerprint': _hash(self.semantic(value)),
                                   'dependencies': set(dependencies)}
        def bind_actions(item):
            if isinstance(item, list):
                for child in item:
                    bind_actions(child)
            elif isinstance(item, dict):
                for key, child in item.items():
                    if (key == 'actionId' or key.endswith('ActionId')) and isinstance(child, str):
                        self.action_sources.setdefault(child, set()).add(sid)
                    else:
                        bind_actions(child)
        bind_actions(value)
        return value

    def selected_sources(self, step):
        selected = set(step.source_ids) | {citation.source_id for citation in step.citations}
        for aid in step.action_ids:
            selected.update(self.action_sources.get(aid, ()))
        # A source-free answer does not exempt supplied mutable facts from checks.
        if not selected:
            selected.update(self.source_checks)
        pending = list(selected)
        while pending:
            for dependency in self.source_checks.get(pending.pop(), {}).get('dependencies', ()):
                if dependency not in selected:
                    selected.add(dependency)
                    pending.append(dependency)
        return selected

    def conversation_snapshot(self, cid, use_focus=False, selected_snapshot=True):
        selected = bool(selected_snapshot and use_focus and self.context_source
                        and cid == self.focus.conversation.conversation_id)
        if cid not in self.conversations and not selected:
            raise ApiError('assistant_scope', 'Ассистент запросил неизвестное обращение', 400)
        conv = self.context_source[0] if selected else self.conversations[cid]
        if selected:
            assessment = self.context_source[1]
            transcript_hash = self.focus.conversation.transcript_hash
        else:
            cohort = self.focus_cohort if use_focus else self.cohort
            evaluation = cohort['evaluations'].get(cid) or cohort['latestEvaluations'].get(cid)
            if evaluation and evaluation.get('transcriptHash') != conv.get('transcriptHash'):
                evaluation = None
            assessment = ({'evaluation': public_evaluation(evaluation), 'checklist': cohort['checklist']}
                          if evaluation else None)
            transcript_hash = conv.get('transcriptHash') or _hash(conv['transcript'])
        return conv, assessment, transcript_hash, selected

    @staticmethod
    def conversation_evidence(conv, assessment, transcript_hash):
        return {'conversationId': conv['id'], 'number': conv.get('number'),
                'language': conv['language'], 'channel': conv['channel'], 'transcriptHash': transcript_hash,
                'turns': [{key: turn[key] for key in ('idx', 'speaker', 'text')} for turn in conv['transcript']],
                'assessment': assessment}

    def source(self, kind, label, data, *, _identity=None, **fields):
        key = _hash([kind, fields, data, _identity])
        existing = next((sid for sid, item in self.source_data.items() if item['key'] == key), None)
        if existing:
            return existing
        if len(self.sources) >= 30:
            raise ApiError('assistant_limit', 'Слишком много источников. Уточните вопрос', 400)
        sid = f's{len(self.sources) + 1}'
        self.sources[sid] = {'id': sid, 'type': kind, 'label': label, **fields}
        self.source_data[sid] = {'key': key, 'data': data}
        return sid

    def action(self, kind, label, **fields):
        value = {'type': kind, 'label': label, **fields}
        existing = next((aid for aid, item in self.actions.items()
                         if {k: v for k, v in item.items() if k != 'id'} == value), None)
        if existing:
            return existing
        if len(self.actions) >= 60:
            return None
        aid = f'a{len(self.actions) + 1}'
        self.actions[aid] = {'id': aid, **value}
        return aid

    def registry_action(self, ids, label, scope=None):
        if len(ids) > 1000:
            return None
        return self.action('show_registry', label,
                           filters={**(scope or self.scope), 'conversationIds': list(ids)})

    def overview(self, use_focus=False):
        r, lang = self.focus_report if use_focus else self.report, self.body.language
        scope = self.focus_cohort['filters'] if use_focus else self.scope
        sid = self.source('analytics', _label(lang, 'Сводка выбранных обращений', 'Таңдалған өтініштер жиынтығы',
                                             'Selected conversation overview'), r['sourceHash'],
                          _identity={'kind': 'overview', 'useFocus': use_focus}, filters=scope)
        overview = {k: v for k, v in r['overview'].items() if k != 'drilldowns'}
        overview['groups'] = {key: {'count': len(ids), 'actionId': self.registry_action(ids,
            _label(lang, 'Показать обращения', 'Өтініштерді көрсету', 'Show conversations'), scope)}
            for key, ids in r['overview']['drilldowns'].items()}
        criteria = []
        for row in sorted(r['criteria'], key=lambda item: (-item['belowTargetCount'], item['title']))[:12]:
            criteria.append({k: row[k] for k in ['id', 'title', 'type', 'assessed', 'applicable', 'na',
                                                'missing', 'avgFraction', 'belowTargetCount', 'flaggedCount']})
            criteria[-1]['actionId'] = self.registry_action(row['belowTargetIds'],
                _label(lang, 'Открыть обращения по критерию', 'Критерий бойынша өтініштерді ашу', 'Open criterion cases'), scope)
        operators = [{k: op[k] for k in ['id', 'name', 'kind', 'count', 'evaluated', 'scoredCount', 'avgScore',
                                          'grossCount', 'lowScoreCount', 'identityVerified', 'smallSample']}
                     for op in r['operators'][:12]]
        value = {'sourceId': sid, 'scope': r['scope'], 'coverage': r['coverage'], 'overview': overview,
                'criteria': criteria, 'criteriaTotal': len(r['criteria']), 'operators': operators,
                'operatorGroupsTotal': len(r['operators']), 'periodComparison': r['periodComparison']}
        return self.bind_source(sid, {'kind': 'overview', 'useFocus': use_focus}, value)

    def topics(self, limit=15, use_focus=False):
        report = self.focus_report if use_focus else self.report
        scope = self.focus_cohort['filters'] if use_focus else self.scope
        r, lang = report['topics'], self.body.language
        sid = self.source('topics', _label(lang, 'Темы выбранных обращений', 'Таңдалған өтініштер тақырыптары',
                                          'Selected conversation topics'), report['sourceHash'],
                          _identity={'kind': 'topics', 'limit': limit, 'useFocus': use_focus}, filters=scope)
        rows = []
        for row in r['rows'][:limit]:
            value = {k: row[k] for k in ['id', 'topic', 'count', 'resolved', 'unresolved', 'unknown',
                                         'known', 'resolutionRate', 'avgScore', 'evaluated', 'scoredCount', 'isRare']}
            value['actionId'] = self.registry_action(row['conversationIds'],
                _label(lang, 'Открыть обращения темы', 'Тақырып өтініштерін ашу', 'Open topic conversations'), scope)
            value['unresolvedActionId'] = self.registry_action(row['unresolvedIds'],
                _label(lang, 'Открыть нерешённые обращения', 'Шешілмеген өтініштерді ашу', 'Open unresolved cases'), scope)
            rows.append(value)
        value = {'sourceId': sid, 'analyzed': r['analyzed'], 'pending': r['pending'],
                'unidentified': r['unidentified'], 'totalTopics': len(r['rows']),
                'truncated': len(r['rows']) > limit, 'rows': rows}
        return self.bind_source(sid, {'kind': 'topics', 'limit': limit, 'useFocus': use_focus}, value)

    def read_conversation(self, cid, use_focus=False, *, selected_snapshot=True):
        conv, assessment, transcript_hash, selected = self.conversation_snapshot(cid, use_focus, selected_snapshot)
        if cid not in self.read_ids and len(self.read_ids) >= MAX_READ_CONVERSATIONS:
            return {'conversationId': cid, 'unavailable': 'conversation_read_limit'}
        self.read_ids.add(cid)
        evaluation_id = assessment['evaluation']['id'] if assessment else None
        snapshot_kind = 'selected' if selected else 'current'
        existing = next((sid for sid, source in self.sources.items()
                         if source['type'] == 'conversation' and source['conversationId'] == cid
                         and source['transcriptHash'] == transcript_hash and source['evaluationId'] == evaluation_id
                         and source.get('snapshotKind') == snapshot_kind
                         and self.source_checks[sid]['recipe']['useFocus'] == use_focus), None)
        if existing:
            return {'sourceId': existing, 'actionId': self.source_data[existing]['actionId'],
                    **self.source_data[existing]['data']}
        remaining = min(18000, MAX_TRANSCRIPT_CHARS - self.transcript_chars)
        turns, consumed = [], 0
        for turn in conv['transcript']:
            if consumed + len(turn['text']) > remaining:
                break
            turns.append({key: turn[key] for key in ['idx', 'speaker', 'text']})
            consumed += len(turn['text'])
        self.transcript_chars += consumed
        data = {'conversationId': cid, 'number': conv.get('number'), 'language': conv['language'],
                'channel': conv['channel'], 'turns': turns, 'totalTurns': len(conv['transcript']),
                'truncated': len(turns) != len(conv['transcript']), 'assessment': assessment,
                'assessmentUnavailableReason': ('stale_transcript' if not assessment
                    and self.rows.get(cid, {}).get('status') == 'stale' else None)}
        number = conv.get('number')
        label = _label(self.body.language, f'Обращение №{number}' if number else 'Обращение',
                       f'№{number} өтініш' if number else 'Өтініш', f'Conversation #{number}' if number else 'Conversation')
        sid = self.source('conversation', label, data, conversationId=cid, number=number,
                          evaluationId=evaluation_id, transcriptHash=transcript_hash, snapshotKind=snapshot_kind,
                          _identity={'useFocus': use_focus, 'selectedSnapshot': selected})
        action_id = self.action('open_conversation', label, conversationId=cid,
                                evaluationId=evaluation_id, transcriptHash=transcript_hash, sourceId=sid)
        self.source_data[sid]['actionId'] = action_id
        self.bind_source(sid, {'kind': 'conversation', 'conversationId': cid, 'useFocus': use_focus,
            'selectedSnapshot': selected}, self.conversation_evidence(conv, assessment, transcript_hash))
        self.action_sources.setdefault(action_id, set()).add(sid)
        return {'sourceId': sid, 'actionId': action_id, **data}

    def search(self, call, *, include_reads=True):
        cohort = self.focus_cohort if call.use_focus else self.cohort
        report = self.focus_report if call.use_focus else self.report
        scope = cohort['filters']
        ids = {conv['id'] for conv in cohort['conversations']}
        if call.filters:
            from .analytics import _select, normalize_filters
            narrow = {condition.field: condition.value for condition in call.filters}
            if len(narrow) != len(call.filters):
                raise ApiError('assistant_tool', 'Ассистент повторил одно условие поиска', 400)
            # A requested focus is intersected even when the tool supplies broader filters.
            narrowed = _select(cohort['_snapshot'], normalize_filters({**scope, **narrow, 'conversationIds': sorted(ids)}))
            ids &= {conv['id'] for conv in narrowed['conversations']}
        if call.criterion_id:
            criterion = next((row for row in report['criteria'] if row['id'] == call.criterion_id), None)
            if criterion is None:
                raise ApiError('assistant_tool', 'Ассистент запросил неизвестный критерий', 400)
            ids &= set(criterion['belowTargetIds'])
        if call.topic_id:
            topic = next((row for row in report['topics']['rows'] if row['id'] == call.topic_id), None)
            if topic is None:
                raise ApiError('assistant_tool', 'Ассистент запросил неизвестную тему', 400)
            ids &= set(topic['conversationIds'])
        if call.resolution_status != 'all':
            ids &= {cid for cid, row in self.rows.items() if row.get('resolutionStatus') == call.resolution_status}
        words = call.query.casefold().split()
        number = re.fullmatch(r'(?:№|#)\s*(\d+)', call.query)
        if number:
            ids &= {cid for cid, conv in self.conversations.items() if conv.get('number') == int(number[1])}
        elif words:
            ids &= {cid for cid, conv in self.conversations.items()
                    if all(word in (cid + ' ' + ' '.join(turn['text'] for turn in conv['transcript'])).casefold()
                           for word in words)}
        ordered = sorted(ids, key=lambda cid: (self.conversations[cid].get('number') or 0, cid))
        lookup_rows = {row['conversationId']: row for row in cohort['rows']}
        rows = [lookup_rows.get(cid) or {'conversationId': cid, 'number': self.conversations[cid].get('number')}
                for cid in ordered[:call.limit]]
        action_id = self.registry_action(ordered, _label(self.body.language, 'Показать найденные обращения',
            'Табылған өтініштерді көрсету', 'Show matching conversations'), scope)
        sid = self.source('analytics', _label(self.body.language, 'Результаты поиска', 'Іздеу нәтижелері',
                                              'Search results'), [ordered, self.source_hash],
                          _identity={'kind': 'search', 'call': call.model_dump(by_alias=True)},
                          filters={**scope, 'conversationIds': ordered[:1000]})
        value = {'sourceId': sid, 'actionId': action_id, 'count': len(ordered), 'rows': rows,
                'truncated': len(ordered) > len(rows), 'searchMeaning': 'literal keywords and intersected filters'}
        reads = ([self.read_conversation(cid, call.use_focus, selected_snapshot=False)
                  for cid in ordered[:min(call.limit, 3)]] if include_reads else [])
        self.bind_source(sid, {'kind': 'search', 'call': call.model_dump(by_alias=True)}, value,
                         [item['sourceId'] for item in reads if item.get('sourceId')])
        return {**value, 'conversations': reads}

    def compare(self, call):
        if call.from_version is None or call.to_version is None:
            raise ApiError('assistant_tool', 'Для сравнения нужны две сохранённые версии', 400)
        versions = {item['version']: item for item in self.cohort['checklists']}
        if call.from_version not in versions or call.to_version not in versions:
            raise ApiError('assistant_tool', 'Ассистент запросил неизвестную версию', 400)
        previous, current = versions[call.from_version], versions[call.to_version]
        self.compare_fingerprints[(previous['id'], current['id'])] = _hash([previous, current])
        before, after = ({c['id']: c for c in value['criteria']} for value in (previous, current))
        changes = []
        for cid in dict.fromkeys([*before, *after]):
            old, new = before.get(cid), after.get(cid)
            fields = [f for f in DIFF_FIELDS if old and new and old.get(f) != new.get(f)]
            if old == new or old and new and not fields:
                continue
            changes.append({'criterionId': cid, 'kind': 'added' if not old else 'removed' if not new else 'changed',
                            'fields': fields, 'before': old, 'after': new,
                            'contentChanged': not old or not new or old.get('contentHash') != new.get('contentHash')})
        sid = self.source('checklist_comparison', _label(self.body.language,
            f'Версии {call.from_version} → {call.to_version}', f'{call.from_version} → {call.to_version} нұсқалары',
            f'Versions {call.from_version} → {call.to_version}'), changes,
            fromVersion=call.from_version, toVersion=call.to_version)
        aid = self.action('compare_versions', _label(self.body.language, 'Сравнить версии',
            'Нұсқаларды салыстыру', 'Compare versions'), fromVersion=call.from_version, toVersion=call.to_version)
        value = {'sourceId': sid, 'actionId': aid, 'fromVersion': call.from_version, 'toVersion': call.to_version,
                'changes': changes[:30], 'changeCount': len(changes), 'truncated': len(changes) > 30,
                'scoreImpact': None, 'note': 'Definitions only. No evaluation or activation was performed.',
                'reuseGuidance': {
                    'eligibilityChecked': False,
                    'requiredConditions': [
                        'A saved, completed answer compatible with the criterion is available.',
                        'The conversation transcript is unchanged.',
                        'The provider, model and evaluation semantics are unchanged.',
                    ],
                    'ifNotMet': 'A new evaluation may be needed. A weights-only definition change does not guarantee zero model calls.',
                    'limits': 'This comparison checks definitions only; it does not check saved records or establish which actual answers are eligible for reuse.',
                }}
        return self.bind_source(sid, {'kind': 'comparison', 'call': call.model_dump(by_alias=True)}, value)

    def execute(self, call):
        if call.name == 'quality_overview':
            return self.overview(call.use_focus)
        if call.name == 'topic_breakdown':
            return self.topics(call.limit, call.use_focus)
        if call.name == 'search_conversations':
            return self.search(call)
        if call.name == 'read_conversations':
            if not call.conversation_ids:
                raise ApiError('assistant_tool', 'Выберите обращения для разбора', 400)
            return {'conversations': [self.read_conversation(cid, call.use_focus)
                                     for cid in dict.fromkeys(call.conversation_ids)]}
        return self.compare(call)

    def initial(self):
        facts = {'overview': self.overview(), 'topics': self.topics(8)}
        if self.context_source:
            facts['selectedConversation'] = self.read_conversation(self.focus.conversation.conversation_id, True)
        if self.focus.comparison:
            selected = self.focus.comparison
            facts['selectedComparison'] = self.compare(ToolCall(name='compare_checklists', query='',
                filters=[], conversation_ids=[], criterion_id=None, topic_id=None,
                resolution_status='all', limit=10, from_version=selected.from_version,
                to_version=selected.to_version))
        return {'mode': 'workspace', 'message': self.body.message,
                'language': self.body.language, 'history': _bounded_history(self.body.history),
                'scope': self.scope, 'focus': {**self.focus.model_dump(by_alias=True),
                    'filters': self.focus_cohort['filters'] if self.focus.filters else {}}, 'facts': facts,
                'checklists': [{key: c[key] for key in ['id', 'version', 'name', 'isActive']}
                               for c in self.cohort['checklists']], 'toolResults': []}

    @staticmethod
    def source_changed():
        return ApiError('assistant_source_changed',
            'Источники обновились во время ответа. Повторите вопрос — актуальные данные загрузятся автоматически', 409)

    def ensure_current(self, step):
        selected = self.selected_sources(step)
        if not selected:
            return selected
        # One coherent fresh read; optional page focus must not invalidate an
        # unrelated answer. Load a selected historical snapshot only if used.
        focus = self.focus.model_copy(update={'conversation': None, 'comparison': None})
        body = self.body.model_copy(update={'focus': focus})
        try:
            fresh = Workspace(self.app, body)
            historical_loaded = False
            for sid in sorted(selected):
                check = self.source_checks.get(sid)
                if check is None:
                    raise self.source_changed()
                recipe = check['recipe']
                kind = recipe['kind']
                if kind == 'conversation':
                    if recipe['selectedSnapshot'] and not historical_loaded:
                        conversation, assessment, _ = _assistant_context(self.app.state.db,
                            self.focus.conversation.conversation_id, self.context_body)
                        fresh.context_source = (conversation.model_dump(by_alias=True), assessment)
                        fresh.focus = fresh.focus.model_copy(update={'conversation': self.focus.conversation})
                        historical_loaded = True
                    conv, assessment, transcript_hash, _ = fresh.conversation_snapshot(
                        recipe['conversationId'], recipe['useFocus'], recipe['selectedSnapshot'])
                    value = self.conversation_evidence(conv, assessment, transcript_hash)
                elif kind == 'overview':
                    value = fresh.overview(recipe['useFocus'])
                elif kind == 'topics':
                    value = fresh.topics(recipe['limit'], recipe['useFocus'])
                elif kind == 'search':
                    value = fresh.search(ToolCall.model_validate(recipe['call']), include_reads=False)
                    value.pop('conversations')
                else:
                    value = fresh.compare(ToolCall.model_validate(recipe['call']))
                if _hash(fresh.semantic(value)) != check['fingerprint']:
                    raise self.source_changed()
        except ApiError as exc:
            if exc.code == 'assistant_source_changed':
                raise
            raise self.source_changed() from exc
        return selected

    def refresh(self, data):
        """Re-read evidence once, without changing a pinned evaluation or billing run."""
        focus = self.focus.model_copy(deep=True)
        try:
            if focus.conversation and focus.conversation.evaluation_id is None:
                from .extras import _conversation_hash
                current = self.app.state.db.get_conversation(focus.conversation.conversation_id)
                focus.conversation.transcript_hash = _conversation_hash(current)
            fresh = Workspace(self.app, self.body.model_copy(update={'focus': focus}))
            fresh.ledger = self.ledger
            fresh.read_ids = set(self.read_ids)
            value = fresh.initial()
            for item in data['toolResults']:
                call = ToolCall.model_validate(item['tool'])
                value['toolResults'].append({'tool': call.model_dump(by_alias=True), 'result': fresh.execute(call)})
            value['sourceRefresh'] = True
            return fresh, value
        except ApiError as exc:
            raise self.source_changed() from exc

    def finish(self, step):
        answer = step.answer
        if not answer.strip() or _HTML.search(answer) or '```' in answer:
            raise ApiError('model_failed', 'Ассистент вернул некорректный текст ответа', 502)
        if set(step.source_ids) - self.sources.keys() or set(step.action_ids) - self.actions.keys():
            raise ApiError('model_failed', 'Ассистент сослался на недоступный источник', 502)
        citations = []
        source_ids = list(dict.fromkeys(step.source_ids))
        for index, citation in enumerate(step.citations):
            source = self.sources.get(citation.source_id)
            if not source or source['type'] != 'conversation':
                raise ApiError('model_failed', 'Ассистент указал неподтверждённую цитату', 502)
            turns = {t['idx']: t['text'] for t in self.source_data[citation.source_id]['data']['turns']}
            if not citation.quote.strip() or citation.quote not in turns.get(citation.turn_idx, ''):
                raise ApiError('model_failed', 'Ассистент указал цитату, которой нет в источнике', 502)
            if citation.source_id not in source_ids:
                source_ids.append(citation.source_id)
            citations.append({'id': f'c{index + 1}', 'conversationId': source['conversationId'],
                'number': source['number'], 'evaluationId': source['evaluationId'],
                'transcriptHash': source['transcriptHash'], 'turnIdx': citation.turn_idx, 'quote': citation.quote})
        for aid in step.action_ids:
            for sid in sorted(self.action_sources.get(aid, ())):
                if sid not in source_ids:
                    source_ids.append(sid)
        used_sources = self.ensure_current(step)
        return {'answer': answer, 'citations': citations,
                'sources': [self.sources[sid] for sid in source_ids],
                'actions': [self.actions[aid] for aid in dict.fromkeys(step.action_ids)],
                'scope': self.scope, 'sourceHash': _hash([(sid, self.source_checks[sid]['fingerprint'])
                    for sid in sorted(used_sources)]),
                **self.ledger.public_usage()}


async def answer_workspace(workspace, emit):
    app = workspace.app
    if not llm_switch.provider_configured('ai', app.state.settings):
        raise ApiError('model_unavailable', 'Функция ИИ недоступна: настройте ключ и модель OpenRouter', 503)
    module = llm_switch.get_ai()
    provider = getattr(module, 'assistant_workspace_round', None)
    if provider is None:
        raise ApiError('model_unavailable', 'Этот поставщик пока не поддерживает рабочий ассистент', 503)
    data = workspace.initial()

    async def run():
        nonlocal workspace, data
        phase, refreshed = 'research', False
        for number in range(1, MAX_ROUNDS + 1):
            await emit({'type': 'progress', 'stage': 'checking' if phase == 'final_review' else 'analyzing',
                        'round': number})
            data.update(round=number, phase=phase, finalRound=phase == 'final_review',
                        toolsAllowed=phase == 'research',
                        sources=list(workspace.sources.values()), actions=list(workspace.actions.values()))
            if len(json_dumps(data)) > 160000:
                raise ApiError('assistant_limit', 'Для одного ответа слишком много данных. Уточните выборку', 400)
            streamed = False
            async def on_delta(text):
                nonlocal streamed
                if not streamed:
                    await emit({'type': 'progress', 'stage': 'answering', 'round': number})
                    streamed = True
                await emit({'type': 'answer_delta', 'text': text})
            raw = await app.state.queue.call_model(provider, deepcopy(data), workspace.ledger.callback(number),
                on_delta if phase == 'final_review' else None, priority=0)
            try:
                step = Step.model_validate(raw['value'])
            except (ValidationError, TypeError, KeyError) as exc:
                raise ApiError('model_failed', 'Ассистент вернул некорректный ответ', 502) from exc
            if not step.tool_calls:
                try:
                    result = workspace.finish(step)
                except ApiError as exc:
                    if exc.code != 'assistant_source_changed' or refreshed or number >= MAX_ROUNDS:
                        raise
                    await emit({'type': 'answer_reset'})
                    await emit({'type': 'progress', 'stage': 'refreshing', 'round': number})
                    workspace, data = workspace.refresh(data)
                    # The prior prose is an untrusted draft; never carry old source
                    # IDs or quotations forward as validated evidence.
                    data['draft'] = {'answer': step.answer}
                    phase, refreshed = 'final_review', True
                    continue
                if phase == 'final_review':
                    if step.fact_audit is None:
                        raise ApiError('model_failed', 'Ассистент не завершил проверку источников', 502)
                    return result
                # A private draft is reviewed against the actual evidence before any
                # answer text is streamed. The review is included in the same call cap.
                data['draft'] = step.model_dump(by_alias=True)
                phase = 'final_review'
                continue
            if step.answer.strip() or step.source_ids or step.action_ids or step.citations:
                raise ApiError('model_failed', 'Ассистент смешал ответ с незавершённым запросом данных', 502)
            if phase != 'research' or number >= MAX_ROUNDS - 1:
                raise ApiError('assistant_limit', 'Не удалось завершить разбор за один ответ. Уточните вопрос', 502)
            for call in step.tool_calls:
                stage = {'search_conversations': 'searching', 'read_conversations': 'reading',
                         'compare_checklists': 'comparing'}.get(call.name, 'analyzing')
                await emit({'type': 'progress', 'stage': stage, 'round': number, 'tool': call.name})
                result = workspace.execute(call)
                if call.name == 'search_conversations' and result.get('conversations'):
                    await emit({'type': 'progress', 'stage': 'reading', 'round': number, 'tool': call.name})
                data['toolResults'].append({'tool': call.model_dump(by_alias=True), 'result': result})
            phase = 'draft'
        raise ApiError('assistant_limit', 'Не удалось завершить разбор за один ответ. Уточните вопрос', 502)
    try:
        return await asyncio.wait_for(run(), timeout=TOTAL_TIMEOUT)
    except (TimeoutError, asyncio.TimeoutError) as exc:
        raise ApiError('assistant_timeout', 'Разбор занял слишком много времени. Уточните вопрос и повторите', 504) from exc
    except JudgeError as exc:
        raise ApiError('model_failed', str(exc), 502) from exc


@router.post('/assistant')
async def assistant(body: WorkspaceRequest, request: Request, stream: bool = False):
    workspace = Workspace(request.app, body)
    if not stream:
        async def ignore(_event):
            pass
        return await answer_workspace(workspace, ignore)

    async def events():
        queue = asyncio.Queue(maxsize=16)

        async def produce():
            try:
                result = await answer_workspace(workspace, queue.put)
                await queue.put({'type': 'done', 'result': result})
            except ApiError as exc:
                await queue.put({'type': 'error', 'error': {'code': exc.code, 'message': exc.message},
                                 **workspace.ledger.public_usage()})
            except asyncio.CancelledError:
                raise
            except Exception:
                await queue.put({'type': 'error', 'error': {'code': 'model_failed',
                    'message': 'Не удалось завершить ответ ассистента. Повторите вопрос'},
                    **workspace.ledger.public_usage()})

        task = asyncio.create_task(produce())
        try:
            while True:
                event = await queue.get()
                yield json_dumps(event) + '\n'
                if event['type'] in ('done', 'error'):
                    break
        finally:
            if not task.done():
                task.cancel()
            await asyncio.gather(task, return_exceptions=True)
    return StreamingResponse(events(), media_type='application/x-ndjson',
                             headers={'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no'})

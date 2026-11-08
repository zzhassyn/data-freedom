"""Persistent semantic topic assignments; frequency affects display, never classification."""
import hashlib
import logging
from typing import Literal

from fastapi import APIRouter, Request
from pydantic import BaseModel, ConfigDict, Field

from . import llm_switch
from .errors import ApiError
from .extras import _cache_lock, _cache_identity, _cached_result, _conversation_hash
from .models import Conversation, TopicAssignment
from .topic_jobs import call_topic, read_job, topic_usage_incomplete

router = APIRouter(prefix='/api/topics')
logger = logging.getLogger(__name__)
VERSION = 'semantic-topics-v1'
MIN_COUNT = 3


def identity(app):
    return _cache_identity(app, 'topic') + ':' + VERSION


def catalog(db, conn=None):
    saved = db.get_cache('topic_catalog', VERSION, conn)
    return saved['body']['topics'] if saved else []


def assignment(app, conv):
    return _cached_result(app.state.db, 'topic', conv['id'], _conversation_hash(conv), identity(app))


def assignments(app, conversations, conn=None):
    """One cache read per snapshot; stale model or transcript assignments stay hidden."""
    provider = identity(app)
    cached = app.state.db.get_caches('topic', conn)
    result = {}
    for conversation in conversations:
        item = cached.get(conversation['id'])
        if (item and item['body'].get('sourceHash') == _conversation_hash(conversation)
                and item['body'].get('providerIdentity') == provider):
            result[conversation['id']] = item['body']['result']
    return result


async def classify(app, cid, *, source_hash=None, provider=None, attempt_id=None, job_id=None):
    # One shared lock prevents concurrent workers creating synonymous catalog entries.
    async with _cache_lock(app, 'topic_catalog', VERSION) as lease:
        db = app.state.db
        conv = db.get_conversation(cid)
        if ((source_hash is not None and source_hash != _conversation_hash(conv))
                or (provider is not None and provider != identity(app))):
            raise ApiError('stale_source', 'Данные или модель изменились. Запустите анализ заново', 409)
        cached = assignment(app, conv)
        if cached is not None:
            return cached
        source_hash, provider = _conversation_hash(conv), identity(app)
        topics = catalog(db)
        raw, usage = await call_topic(app, llm_switch.get_ai().classify_topic,
            Conversation.model_validate(conv), topics, source_hash=source_hash, provider=provider,
            lease=lease, attempt_id=attempt_id, job_id=job_id)
        result = TopicAssignment.model_validate(raw)
        if _conversation_hash(db.get_conversation(cid)) != source_hash or identity(app) != provider:
            raise ApiError('stale_source', 'Транскрипт изменился во время анализа. Повторите анализ', 409)
        topic_id = result.topic_id
        if topic_id and (result.new_title is not None or topic_id not in {t['id'] for t in topics}):
            raise ApiError('model_failed', 'Модель выбрала неизвестную тему', 502)
        if not topic_id and result.new_title:
            title = ' '.join(result.new_title.split())
            key = title.casefold().replace('ё', 'е')
            existing = next((t for t in topics if t['title'].casefold().replace('ё', 'е') == key), None)
            topic_id = existing['id'] if existing else 'topic_' + hashlib.sha256(key.encode()).hexdigest()[:16]
            if not existing:
                topics.append({'id': topic_id, 'title': title})
        body = {'topicId': topic_id, 'resolutionStatus': result.resolution_status}
        with db.transaction() as conn:
            guard = getattr(app.state, 'background_guard', None)
            if guard:
                guard(conn)
            if lease:
                lease.check(conn)
            if _conversation_hash(db.get_conversation(cid, conn)) != source_hash or identity(app) != provider:
                raise ApiError('stale_source', 'Данные или модель изменились. Запустите анализ заново', 409)
            db.set_cache('topic_catalog', VERSION, {'topics': topics}, conn=conn)
            db.set_cache('topic', cid, {'sourceHash': source_hash, 'providerIdentity': provider, 'result': body}, usage, conn)
        return body


def report(app, channel='all'):
    with app.state.db.read_connection() as conn:
        convs = [c for c in app.state.db.all_conversations(conn)
                 if channel == 'all' or c['channel'] == {'calls': 'voice call', 'chats': 'agent chat'}[channel]]
        saved_assignments = assignments(app, convs, conn)
        titles = {t['id']: t['title'] for t in catalog(app.state.db, conn)}
    groups = {}
    analyzed = unidentified = 0
    for conv in convs:
        item = saved_assignments.get(conv['id'])
        if item is None:
            continue
        analyzed += 1
        topic_id = item.get('topicId')
        if topic_id not in titles:
            unidentified += 1
            continue
        row = groups.setdefault(topic_id, {'id': topic_id, 'topic': titles[topic_id], 'count': 0,
                                           'resolved': 0, 'known': 0, 'conversationIds': []})
        row['count'] += 1
        row['conversationIds'].append(conv['id'])
        row['resolved'] += item['resolutionStatus'] == 'resolved'
        row['known'] += item['resolutionStatus'] in ('resolved', 'unresolved')
    visible = sorted((g for g in groups.values() if g['count'] >= MIN_COUNT), key=lambda g: (-g['count'], g['topic']))
    for group in visible:
        group['unresolved'] = group['known'] - group['resolved']
        group['unknown'] = group['count'] - group['known']
    return {'total': len(convs), 'analyzed': analyzed, 'pending': len(convs) - analyzed,
            'unidentified': unidentified, 'hiddenCount': sum(g['count'] for g in groups.values() if g['count'] < MIN_COUNT),
            'minCount': MIN_COUNT, 'rows': visible,
            'job': read_job(app.state.db)}


@router.get('')
async def get_topics(request: Request, channel: Literal['all', 'calls', 'chats'] = 'all'):
    return report(request.app, channel)


class TopicAnalysisRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')
    conversation_ids: list[str] | None = Field(default=None, alias='conversationIds', max_length=2000)


@router.post('/analyze')
async def start_analysis(request: Request, body: TopicAnalysisRequest | None = None):
    requested = None if body is None else body.conversation_ids
    return request.app.state.topic_jobs.enqueue(requested)

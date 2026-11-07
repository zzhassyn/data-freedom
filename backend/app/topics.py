"""Persistent semantic topic assignments; frequency affects display, never classification."""
import asyncio
import hashlib
import logging
from typing import Literal

from fastapi import APIRouter, Request

from . import llm_switch
from .errors import ApiError
from .extras import _cache_lock, _cache_identity, _cached_result, _call, _conversation_hash
from .models import Conversation, TopicAssignment

router = APIRouter(prefix='/api/topics')
logger = logging.getLogger(__name__)
VERSION = 'semantic-topics-v1'
MIN_COUNT = 3


def identity(app):
    return _cache_identity(app, 'topic') + ':' + VERSION


def catalog(db):
    saved = db.get_cache('topic_catalog', VERSION)
    return saved['body']['topics'] if saved else []


def assignment(app, conv):
    return _cached_result(app.state.db, 'topic', conv['id'], _conversation_hash(conv), identity(app))


async def classify(app, cid):
    # One shared lock prevents concurrent workers creating synonymous catalog entries.
    async with _cache_lock(app, 'topic_catalog', VERSION):
        db = app.state.db
        conv = db.get_conversation(cid)
        cached = assignment(app, conv)
        if cached is not None:
            return cached
        source_hash, provider = _conversation_hash(conv), identity(app)
        topics = catalog(db)
        raw, usage = await _call(app, llm_switch.get_ai().classify_topic,
                                 Conversation.model_validate(conv), topics, priority=10)
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
            db.set_cache('topic_catalog', VERSION, {'topics': topics}, conn=conn)
            db.set_cache('topic', cid, {'sourceHash': source_hash, 'providerIdentity': provider, 'result': body}, usage, conn)
        return body


def report(app, channel='all'):
    convs = [c for c in app.state.db.all_conversations()
             if channel == 'all' or c['channel'] == {'calls': 'voice call', 'chats': 'agent chat'}[channel]]
    groups = {}
    analyzed = unidentified = 0
    titles = {t['id']: t['title'] for t in catalog(app.state.db)}
    for conv in convs:
        item = assignment(app, conv)
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
    return {'total': len(convs), 'analyzed': analyzed, 'pending': len(convs) - analyzed,
            'unidentified': unidentified, 'hiddenCount': sum(g['count'] for g in groups.values() if g['count'] < MIN_COUNT),
            'minCount': MIN_COUNT, 'rows': visible,
            'job': getattr(app.state, 'topic_job', {'status': 'idle'})}


@router.get('')
async def get_topics(request: Request, channel: Literal['all', 'calls', 'chats'] = 'all'):
    return report(request.app, channel)


async def analyze(app, ids, job):
    try:
        for cid in ids:
            try:
                await classify(app, cid)
                job['processed'] += 1
            except ApiError as exc:
                job['failed'] += 1
                job['error'] = exc.message
                # Keep successful results; retry resumes from missing assignments.
                if exc.code in ('model_unavailable', 'model_failed'):
                    break
            except Exception:
                logger.exception('Topic classification failed')
                job['failed'] += 1
                job['error'] = 'Не удалось определить тему. Повторите анализ'
                break
        job['status'] = 'error' if job['failed'] else 'done'
    except asyncio.CancelledError:
        job['status'] = 'interrupted'
        raise


@router.post('/analyze')
async def start_analysis(request: Request):
    app = request.app
    async with _cache_lock(app, 'topics_job', VERSION):
        if getattr(app.state, 'topic_job', {}).get('status') == 'running':
            return app.state.topic_job
        if not llm_switch.provider_configured('ai', app.state.settings):
            raise ApiError('model_unavailable', 'Укажите ключ OpenRouter и модель в настройках сервера', 503)
        ids = [c['id'] for c in app.state.db.all_conversations() if assignment(app, c) is None]
        job = {'status': 'running' if ids else 'done', 'total': len(ids), 'processed': 0, 'failed': 0, 'error': None}
        app.state.topic_job = job
        if ids:
            task = asyncio.create_task(analyze(app, ids, job))
            app.state.background_tasks.add(task)
            task.add_done_callback(app.state.background_tasks.discard)
        return dict(job)

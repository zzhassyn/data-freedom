"""Durable topic batches and paid-call receipts, shared by API and leased worker."""
import asyncio
import logging
import time
import uuid

from pydantic import ValidationError

from . import llm_switch
from .background import LeaseLost
from .db import utcnow
from .errors import ApiError
from .models import Usage

logger = logging.getLogger(__name__)
JOB_KIND = 'topic_job'
JOB_KEY = 'semantic-topics-v1'
ATTEMPT_KIND = 'topic_attempt'
INTERRUPTED = 'Анализ прервался. Уже отправленный запрос не повторялся; запустите анализ оставшихся тем явно'


def _read(db, conn=None):
    cached = db.get_cache(JOB_KIND, JOB_KEY, conn)
    return cached['body'] if cached else None


def _refresh(job):
    items = job['items']
    job['processed'] = sum(item['status'] == 'done' for item in items)
    job['failed'] = sum(item['status'] == 'failed' for item in items)
    job['skipped'] = sum(item['status'] == 'skipped' for item in items)
    job['pending'] = sum(item['status'] in {'queued', 'running'} for item in items)
    job['phase'] = ('running' if any(item['status'] == 'running' for item in items)
                    else 'queued' if job['pending'] else 'finished')
    job['status'] = 'running' if job['pending'] else 'error' if job['failed'] else 'done'
    job['updatedAt'] = utcnow()
    return job


def _public(job):
    if job is None:
        return {'status': 'idle', 'phase': 'idle', 'total': 0, 'processed': 0,
                'failed': 0, 'pending': 0, 'skipped': 0, 'error': None, 'conversationIds': []}
    keys = ('id', 'status', 'phase', 'total', 'processed', 'failed', 'pending', 'skipped',
            'error', 'createdAt', 'updatedAt', 'usageIncomplete')
    return {**{key: job[key] for key in keys if key in job},
            'conversationIds': [item['conversationId'] for item in job['items']]}


def read_job(db, conn=None):
    if conn is None:
        with db.read_connection() as connection:
            return read_job(db, connection)
    job = _read(db, conn)
    if job:
        receipts = db.get_caches(ATTEMPT_KIND, conn)
        job['usageIncomplete'] = any(
            receipts.get(item['attemptId'], {}).get('body', {}).get('usageIncomplete', False)
            for item in job['items'])
    return _public(job)


def topic_usage_incomplete(db, conn=None):
    return any(value['body'].get('requestSent') and value['body'].get('usageIncomplete', True)
               for value in db.get_caches(ATTEMPT_KIND, conn).values())


def _known_usage(value):
    raw = value.get('usage') if isinstance(value, dict) else getattr(value, 'usage', None)
    try:
        usage = Usage.model_validate(raw).model_dump(by_alias=True) if raw is not None else None
    except (ValidationError, TypeError, ValueError):
        return None
    # Provider failures can attach a synthetic all-zero Usage. It is not a receipt.
    return usage if usage and usage['calls'] > 0 else None


class TopicAttempt:
    def __init__(self, db, attempt_id, *, cid, source_hash, provider, job_id=None):
        self.db, self.id = db, attempt_id
        with db.transaction() as conn:
            if db.get_cache(ATTEMPT_KIND, self.id, conn) is None:
                db.set_cache(ATTEMPT_KIND, self.id, {
                    'id': self.id, 'jobId': job_id, 'conversationId': cid,
                    'sourceHash': source_hash, 'providerIdentity': provider,
                    'status': 'prepared', 'requestSent': False, 'usageIncomplete': False,
                    'recorded': False, 'createdAt': utcnow()}, conn=conn)

    def sent(self, conn):
        body = self.db.get_cache(ATTEMPT_KIND, self.id, conn)['body']
        if body['requestSent']:
            raise ApiError('topic_request_replayed', 'Этот запрос уже был отправлен. Запустите новый анализ явно', 409)
        body.update(status='sent', requestSent=True, usageIncomplete=True, sentAt=utcnow())
        self.db.set_cache(ATTEMPT_KIND, self.id, body, conn=conn)

    def finish(self, status, usage=None, latency_ms=0):
        # Receipts belong to this immutable attempt even if its worker lost the
        # lease. A late known cost may settle uncertainty, never publish a result.
        with self.db.transaction() as conn:
            saved = self.db.get_cache(ATTEMPT_KIND, self.id, conn)
            body = saved['body']
            if usage is not None and not body.get('recorded'):
                self.db.record_usage(usage, latency_ms=latency_ms, kind='topic', conn=conn)
                body['recorded'] = True
            body.update(status=status, finishedAt=utcnow(),
                        usageIncomplete=bool(body['requestSent'] and not body.get('recorded')))
            self.db.set_cache(ATTEMPT_KIND, self.id, body, usage or saved['usage'], conn)


async def call_topic(app, function, conversation, catalog, *, source_hash, provider,
                     lease=None, attempt_id=None, job_id=None):
    """One explicit send; queue-level 429 retry cannot duplicate this request."""
    from . import topics
    if not llm_switch.provider_configured('ai', app.state.settings):
        raise ApiError('model_unavailable', 'Укажите ключ OpenRouter и модель в настройках сервера', 503)
    db = app.state.db
    attempt = TopicAttempt(db, attempt_id or uuid.uuid4().hex, cid=conversation.id,
                           source_hash=source_hash, provider=provider, job_id=job_id)
    started = time.monotonic()

    async def invoke():
        with db.transaction() as conn:
            guard = getattr(app.state, 'background_guard', None)
            if guard:
                guard(conn)
            if lease:
                lease.check(conn)
            if (db.get_conversation(conversation.id, conn)['transcriptHash'] != source_hash
                    or topics.identity(app) != provider):
                raise ApiError('stale_source', 'Данные или модель изменились. Запустите анализ заново', 409)
            attempt.sent(conn)
        if lease:
            lease.started = True
        try:
            raw = await function(conversation, catalog)
        except asyncio.CancelledError:
            attempt.finish('interrupted')
            raise
        except Exception as exc:
            attempt.finish('failed', _known_usage(exc), int((time.monotonic() - started) * 1000))
            # Deliberately hide status_code/response from the generic 429 retry.
            raise ApiError('model_failed', 'Модель не ответила. Повторите анализ оставшихся тем явно', 502) from exc
        usage = _known_usage(raw)
        attempt.finish('done', usage, int((time.monotonic() - started) * 1000))
        return raw, usage or {}

    try:
        return await app.state.queue.call_model(invoke, priority=10)
    except asyncio.TimeoutError as exc:
        attempt.finish('interrupted')
        raise ApiError('model_failed', 'Время анализа истекло. Повторите анализ оставшихся тем явно', 502) from exc


class TopicJobs:
    def __init__(self, app):
        self.app, self.db = app, app.state.db
        self.guard = getattr(app.state, 'background_guard', None)
        self.task = None
        self.closing = False

    def _check(self, conn):
        if self.guard:
            self.guard(conn)

    def enqueue(self, requested=None):
        from . import topics
        with self.db.transaction() as conn:
            conversations = self.db.all_conversations(conn)
            all_ids = {row['id'] for row in conversations}
            selected = None if requested is None else set(requested)
            if selected is not None and not selected <= all_ids:
                raise ApiError('invalid_filter', 'В выбранной группе есть неизвестное обращение', 400)
            scope = conversations if selected is None else [row for row in conversations if row['id'] in selected]
            cached = topics.assignments(self.app, scope, conn)
            missing = [row for row in scope if row['id'] not in cached]
            if not missing:
                return {**_public(None), 'status': 'done', 'phase': 'finished'}
            provider = topics.identity(self.app)
            active = _read(self.db, conn)
            if active and active['status'] == 'running':
                sources = {item['conversationId']: item['sourceHash'] for item in active['items']}
                if (active['providerIdentity'] != provider
                        or any(sources.get(row['id']) != row['transcriptHash'] for row in missing)):
                    raise ApiError('topic_analysis_running', 'Дождитесь завершения текущего анализа тем', 409)
            else:
                if not llm_switch.provider_configured('ai', self.app.state.settings):
                    raise ApiError('model_unavailable', 'Укажите ключ OpenRouter и модель в настройках сервера', 503)
                job = _refresh({'id': uuid.uuid4().hex, 'providerIdentity': provider,
                    'createdAt': utcnow(), 'total': len(missing), 'error': None, 'usageIncomplete': False,
                    'items': [{'conversationId': row['id'], 'sourceHash': row['transcriptHash'],
                               'status': 'queued', 'attemptId': uuid.uuid4().hex} for row in missing]})
                self.db.set_cache(JOB_KIND, JOB_KEY, job, conn=conn)
        self.poll_pending()
        return read_job(self.db)

    def recover(self):
        from . import topics
        with self.db.transaction() as conn:
            self._check(conn)
            job = _read(self.db, conn)
            if not job or job['status'] != 'running':
                return
            for item in job['items']:
                if item['status'] != 'running':
                    continue
                saved = self.db.get_cache(ATTEMPT_KIND, item['attemptId'], conn)
                receipt = saved['body'] if saved else {}
                conv = self.db.get_conversation(item['conversationId'], conn)
                valid_cache = topics.assignments(self.app, [conv], conn)
                if (conv['transcriptHash'] == item['sourceHash'] and job['providerIdentity'] == topics.identity(self.app)
                        and item['conversationId'] in valid_cache):
                    item['status'] = 'done'
                elif receipt.get('requestSent'):
                    item['status'] = 'failed'
                    job['error'] = INTERRUPTED
                    if not receipt.get('recorded'):
                        receipt.update(status='interrupted', usageIncomplete=True)
                        self.db.set_cache(ATTEMPT_KIND, item['attemptId'], receipt, saved['usage'], conn)
                else:
                    item['status'] = 'queued'
            job['usageIncomplete'] = any(
                (self.db.get_cache(ATTEMPT_KIND, item['attemptId'], conn) or {}).get('body', {}).get('usageIncomplete', False)
                for item in job['items'])
            self.db.set_cache(JOB_KIND, JOB_KEY, _refresh(job), conn=conn)

    async def start(self):
        self.closing = False
        if self.app.state.settings.worker_mode == 'api':
            return
        self.recover()
        self.poll_pending()

    def poll_pending(self):
        if self.closing or self.app.state.settings.worker_mode == 'api' or self.task and not self.task.done():
            return
        if self.task is not None:
            try:
                self.task.result()
            except LeaseLost:
                raise
            except (Exception, asyncio.CancelledError):
                # An explicit request/poll can recover a completed local task
                # after transient persistence failure. Sent work is never replayed.
                logger.exception('Recovering interrupted topic dispatcher')
                self.task = None
                self.recover()
        job = _read(self.db)
        if job and job['status'] == 'running' and any(item['status'] == 'queued' for item in job['items']):
            self.task = asyncio.create_task(self._drain())

    def _claim(self):
        with self.db.transaction() as conn:
            self._check(conn)
            job = _read(self.db, conn)
            if not job or job['status'] != 'running' or any(item['status'] == 'running' for item in job['items']):
                return None
            item = next((item for item in job['items'] if item['status'] == 'queued'), None)
            if item is None:
                return None
            item['status'] = 'running'
            self.db.set_cache(JOB_KIND, JOB_KEY, _refresh(job), conn=conn)
            return job['id'], job['providerIdentity'], dict(item)

    def _finish(self, job_id, item, *, error=None, stop=False):
        with self.db.transaction() as conn:
            self._check(conn)
            job = _read(self.db, conn)
            if not job or job['id'] != job_id:
                return
            current = next((row for row in job['items'] if row['attemptId'] == item['attemptId']), None)
            if current is None or current['status'] != 'running':
                return
            current['status'] = 'failed' if error else 'done'
            receipt = self.db.get_cache(ATTEMPT_KIND, item['attemptId'], conn)
            job['usageIncomplete'] |= bool(receipt and receipt['body'].get('usageIncomplete'))
            if error:
                job['error'] = error
            if stop:
                for row in job['items']:
                    if row['status'] == 'queued':
                        row['status'] = 'skipped'
            self.db.set_cache(JOB_KIND, JOB_KEY, _refresh(job), conn=conn)

    def _requeue_unsent(self, job_id, item):
        with self.db.transaction() as conn:
            self._check(conn)
            job = _read(self.db, conn)
            if not job or job['id'] != job_id:
                return False
            receipt = self.db.get_cache(ATTEMPT_KIND, item['attemptId'], conn)
            if receipt and receipt['body'].get('requestSent'):
                return False
            current = next((row for row in job['items'] if row['attemptId'] == item['attemptId']), None)
            if current is None or current['status'] != 'running':
                return False
            current['status'] = 'queued'
            self.db.set_cache(JOB_KIND, JOB_KEY, _refresh(job), conn=conn)
            return True

    async def _drain(self):
        from . import topics
        while not self.closing:
            claimed = self._claim()
            if claimed is None:
                return
            job_id, provider, item = claimed
            try:
                await topics.classify(self.app, item['conversationId'], source_hash=item['sourceHash'],
                                      provider=provider, attempt_id=item['attemptId'], job_id=job_id)
            except asyncio.CancelledError:
                # The provider task may still be unwinding cancellation. Retain
                # running state; recovery inspects the durable sent receipt.
                raise
            except LeaseLost:
                raise
            except ApiError as exc:
                if exc.code == 'ai_request_running' and self._requeue_unsent(job_id, item):
                    # A previous owner's catalog reservation outlives its worker
                    # lease. Wait for it without failing or sending this item.
                    return
                if self.closing and self._requeue_unsent(job_id, item):
                    return
                self._finish(job_id, item, error=exc.message,
                             stop=exc.code in {'model_unavailable', 'model_failed'})
            except Exception:
                if self.closing and self._requeue_unsent(job_id, item):
                    return
                logger.exception('Topic classification failed')
                self._finish(job_id, item, error='Не удалось определить тему. Повторите анализ', stop=True)
            else:
                self._finish(job_id, item)

    async def close(self):
        self.closing = True
        if self.task is not None:
            if not self.task.done():
                self.task.cancel()
            await asyncio.gather(self.task, return_exceptions=True)

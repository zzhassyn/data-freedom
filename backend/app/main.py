"""Run with: uvicorn app.main:app --port 8000 (one worker)."""
import asyncio
import json
import logging
import time
from contextlib import asynccontextmanager
from urllib.parse import urlsplit

import httpx
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException

from . import llm_switch
from .db import Database
from .errors import ApiError, JudgeError
from .settings import BASE_DIR, Settings

logger = logging.getLogger(__name__)


def error_response(code, message, status):
    return JSONResponse({'error': {'code': code, 'message': message}}, status_code=status)


def origin_parts(value):
    try:
        if not value or any(c.isspace() or ord(c) < 32 for c in value):
            return None
        url = urlsplit(value)
        if (url.scheme not in {'http', 'https'} or not url.hostname or url.username is not None
                or url.password is not None or url.path or url.query or url.fragment):
            return None
        return url.scheme, url.hostname.lower(), url.port or (443 if url.scheme == 'https' else 80)
    except ValueError:
        return None


def trusted_request_origin(request):
    origins = request.headers.getlist('origin')
    sites = request.headers.getlist('sec-fetch-site')
    if len(origins) > 1 or len(sites) > 1:
        return False
    if sites and sites[0] not in {'same-origin', 'same-site', 'cross-site', 'none'}:
        return False
    if origins:
        origin = origin_parts(origins[0])
        own = origin_parts(str(request.base_url).rstrip('/'))
        return origin is not None and (origin == own or (origin[0] == 'http' and origin[1] in {'localhost', '127.0.0.1'}))
    return not sites or sites[0] == 'same-origin'


def create_app(settings=None, *, providers=None, background_guard=None):
    config = settings or Settings()

    @asynccontextmanager
    async def lifespan(application):
        from .checklists import seed_checklist
        from .evaluations import EvaluationQueue
        from .stt.service import TranscriptionQueue
        from .topic_jobs import TopicJobs
        application.state.settings = config
        if config.worker_mode == 'worker' and background_guard is None:
            raise RuntimeError('Start a cloud worker through python -m app.worker')
        application.state.db = Database(config.db_path, remote_url=config.db_url, auth_token=config.db_auth_token)
        if background_guard:
            background_guard()
        seed_checklist(application.state.db)
        llm_switch.configure(config.judge, config, providers)
        application.state.queue = EvaluationQueue(application.state.db, config)
        application.state.stt = TranscriptionQueue(application.state.db, config)
        application.state.queue.background_guard = background_guard
        application.state.stt.background_guard = background_guard
        application.state.stt.store.guard = background_guard
        application.state.background_guard = background_guard
        application.state.topic_jobs = TopicJobs(application)
        application.state.background_tasks = set()
        application.state.health_cache = None
        application.state.health_lock = asyncio.Lock()
        application.state.source_lock = asyncio.Lock()
        await application.state.queue.start()
        await application.state.stt.start()
        await application.state.topic_jobs.start()
        try:
            yield
        finally:
            await application.state.topic_jobs.close()
            await application.state.stt.close()
            for task in application.state.background_tasks:
                task.cancel()
            await asyncio.gather(*application.state.background_tasks, return_exceptions=True)
            await application.state.queue.close()

    application = FastAPI(title='DataAvengers API', version='1.0.0', lifespan=lifespan)
    application.add_middleware(CORSMiddleware, allow_origin_regex=r'^https?://(localhost|127\.0\.0\.1)(:\d+)?$', allow_credentials=False, allow_methods=['*'], allow_headers=['*'], expose_headers=['Content-Range','Accept-Ranges','Content-Disposition'])

    @application.middleware('http')
    async def request_limit(request, call_next):
        if request.method in {'POST','PUT','PATCH'}:
            size = 0
            parts = []
            async for part in request.stream():
                size += len(part)
                if size > 20 * 1024 * 1024:
                    return error_response('too_large', 'Файл превышает 20 МБ. Разделите набор на несколько файлов', 413)
                parts.append(part)
            request._body = b''.join(parts)
        return await call_next(request)

    # Registered after the size limiter so rejected requests never reach body parsing.
    @application.middleware('http')
    async def protect_mutations(request, call_next):
        if request.method not in {'GET', 'HEAD', 'OPTIONS'}:
            if not trusted_request_origin(request):
                return error_response('forbidden_origin', 'Запрос отклонён: чужой источник', 403)
            expected = 'text/csv' if request.method == 'POST' and request.url.path.rstrip('/') == '/api/gold' else 'application/json'
            types = request.headers.getlist('content-type')
            if len(types) != 1 or types[0].split(';', 1)[0].strip().lower() != expected:
                return error_response('unsupported_media_type', f'Требуется Content-Type: {expected}', 415)
        return await call_next(request)

    @application.exception_handler(ApiError)
    async def api_error(request, exc):
        return error_response(exc.code, exc.message, exc.status)

    @application.exception_handler(RequestValidationError)
    async def validation_error(request, exc):
        fields = ', '.join('.'.join(str(p) for p in e['loc'] if p != 'body') for e in exc.errors())
        return error_response('invalid_request', f'Проверьте формат и обязательные поля запроса: {fields}', 400)

    @application.exception_handler(json.JSONDecodeError)
    async def json_error(request, exc):
        return error_response('invalid_json', 'Тело запроса должно содержать корректный JSON', 400)

    @application.exception_handler(HTTPException)
    async def http_error(request, exc):
        message = 'Маршрут не найден' if exc.status_code == 404 else 'Запрос не поддерживается'
        return error_response('not_found' if exc.status_code == 404 else 'invalid_request', message, exc.status_code)

    @application.exception_handler(Exception)
    async def internal_error(request, exc):
        logger.error('Request failed on %s (%s)', request.url.path, type(exc).__name__)
        return error_response('internal_error', 'Не удалось обработать запрос. Повторите попытку', 500)

    from . import conversations, checklists, evaluations, appeals, apply, stats, extras, export, operators, stt, topics, bootstrap, assistant_workspace
    for feature in (conversations, checklists, evaluations, appeals, apply, stats, extras, export, operators, stt, topics, bootstrap, assistant_workspace):
        application.include_router(feature.router)

    @application.get('/api/health')
    async def health(request: Request):
        state = request.app.state
        async with state.health_lock:
            cached = state.health_cache
            if cached is None or time.monotonic() - cached['at'] >= 20:
                try:
                    judge = llm_switch.get_judge()
                except JudgeError:
                    judge = None
                online = False
                if llm_switch.has_provider_overrides():
                    model = judge.configured_model() if hasattr(judge, 'configured_model') else 'не настроена'
                elif config.judge == 'openrouter':
                    model = config.judge_model or 'не настроена'
                    if judge is not None and config.openrouter_api_key and config.judge_model:
                        try:
                            async with httpx.AsyncClient(timeout=3, follow_redirects=False, trust_env=False) as client:
                                response = await client.get('https://openrouter.ai/api/v1/key',
                                    headers={'Authorization': 'Bearer ' + config.openrouter_api_key})
                                payload = response.json() if response.is_success else None
                                online = isinstance(payload, dict) and isinstance(payload.get('data'), dict)
                        except (httpx.HTTPError, ValueError, asyncio.TimeoutError):
                            online = False
                else:
                    model = config.llm_model or 'не настроена'
                    if judge is not None and config.llm_api_key and config.llm_model:
                        try:
                            async with httpx.AsyncClient(timeout=3) as client:
                                response = await asyncio.wait_for(client.post(config.llm_base_url.rstrip('/') + '/chat/completions', headers={'Authorization': 'Bearer ' + config.llm_api_key}, json={'model': config.llm_model, 'messages': [{'role': 'user', 'content': 'Reply OK'}], 'max_tokens': 1}), timeout=3)
                                payload = response.json() if response.is_success else None
                                online = isinstance(payload, dict) and bool(payload.get('choices'))
                        except (httpx.HTTPError, ValueError, asyncio.TimeoutError):
                            online = False
                state.health_cache = {'at': time.monotonic(), 'model': model, 'online': online}
            cached = state.health_cache
        db = state.db
        from .evaluations import is_evaluation_visible
        with db.read_connection() as conn:
            evaluations = db.all_evaluations(conn)
            metrics = conn.execute("""SELECT
                AVG(CASE WHEN kind='evaluation' THEN latency_ms END) AS avg_ms,
                SUM(cost_usd) AS cost,
                EXISTS(SELECT 1 FROM ai_cache WHERE kind='assistant_attempt'
                    AND json_extract(body_json, '$.requestSent') = 1
                    AND COALESCE(json_extract(body_json, '$.usageKnown'), 0) = 0) AS assistant_incomplete,
                EXISTS(SELECT 1 FROM ai_cache WHERE kind='topic_attempt'
                    AND json_extract(body_json, '$.requestSent') = 1
                    AND CASE WHEN json_type(body_json, '$.usageIncomplete') IS NULL THEN 1
                        ELSE COALESCE(json_extract(body_json, '$.usageIncomplete'), 0) END = 1) AS topics_incomplete
                FROM model_calls""").fetchone()
        visible = [ev for ev in evaluations if is_evaluation_visible(ev)]
        costs = [ev['usage']['costUsd'] for ev in visible if ev['status'] == 'done' and not ev.get('usageIncomplete')]
        average_ms = metrics['avg_ms'] or 0
        if not llm_switch.has_provider_overrides():
            timings = [item['latencyMs'] for ev in visible
                       for item in ev['items'] if not item.get('reused') and item.get('latencyMs') is not None
                       and (item.get('usage') or {}).get('calls', 0) > 0]
            average_ms = sum(timings) / len(timings) if timings else 0
        batch_timings = [attempt['latencyMs'] for ev in visible for attempt in ev.get('_batchCalls', [])
                         if attempt.get('latencyMs') is not None and attempt.get('requestSent')
                         and attempt.get('status') in {'done', 'failed'}]
        return dict(ok=True, model=cached['model'], modelOnline=cached['online'],
                    avgCriterionMs=round(average_ms, 2),
                    avgBatchMs=round(sum(batch_timings) / len(batch_timings), 2) if batch_timings else None,
                    avgEvaluationCostUsd=sum(costs)/len(costs) if costs else 0,
                    totalCostUsd=metrics['cost'] or 0,
                    totalCostIncomplete=(any(ev.get('usageIncomplete') for ev in visible)
                                         or bool(metrics['assistant_incomplete']) or bool(metrics['topics_incomplete'])))

    application.mount('/', StaticFiles(directory=str(BASE_DIR.parent / 'web'), html=True), name='web')
    return application


app = create_app()

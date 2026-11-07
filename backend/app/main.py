"""Run with: uvicorn app.main:app --port 8000 (one worker)."""
import asyncio
import json
import logging
import time
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException

from . import llm_switch
from .db import Database
from .errors import ApiError
from .settings import BASE_DIR, Settings

logger = logging.getLogger(__name__)


def error_response(code, message, status):
    return JSONResponse({'error': {'code': code, 'message': message}}, status_code=status)


def create_app(settings=None):
    config = settings or Settings()

    @asynccontextmanager
    async def lifespan(application):
        from .checklists import seed_checklist
        from .evaluations import EvaluationQueue
        application.state.settings = config
        application.state.db = Database(config.db_path)
        seed_checklist(application.state.db)
        llm_switch.configure(config.judge, config.fake_delay)
        application.state.queue = EvaluationQueue(application.state.db, config)
        application.state.background_tasks = set()
        application.state.health_cache = None
        application.state.health_lock = asyncio.Lock()
        await application.state.queue.start()
        try:
            yield
        finally:
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

    from . import conversations, checklists, evaluations, appeals, apply, stats, extras, export, operators
    for feature in (conversations, checklists, evaluations, appeals, apply, stats, extras, export, operators):
        application.include_router(feature.router)

    @application.get('/api/health')
    async def health(request: Request):
        state = request.app.state
        async with state.health_lock:
            cached = state.health_cache
            if cached is None or time.monotonic() - cached['at'] >= 20:
                judge = llm_switch.get_judge()
                fake = getattr(judge, 'IS_FAKE', False)
                online = False
                if fake:
                    online = not llm_switch.fallback_info()['judge']
                    model = 'fake'
                else:
                    model = config.llm_model or 'не настроена'
                    if config.llm_api_key and config.llm_model:
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
        evaluations_done = [ev for ev in db.all_evaluations() if ev['status'] == 'done']
        costs = [ev['usage']['costUsd'] for ev in evaluations_done]
        with db.transaction() as conn:
            metrics = conn.execute("SELECT AVG(CASE WHEN kind='evaluation' THEN latency_ms END) AS avg_ms, SUM(cost_usd) AS cost FROM model_calls").fetchone()
        return dict(ok=True, model=cached['model'], modelOnline=cached['online'], avgCriterionMs=round(metrics['avg_ms'] or 0, 2), avgEvaluationCostUsd=sum(costs)/len(costs) if costs else 0, totalCostUsd=metrics['cost'] or 0)

    application.mount('/', StaticFiles(directory=str(BASE_DIR.parent / 'web'), html=True), name='web')
    return application


app = create_app()

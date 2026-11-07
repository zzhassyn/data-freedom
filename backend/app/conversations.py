"""Organizer import, normalized transcripts, searchable registry and streaming audio."""
import asyncio
import hashlib
import logging
import re
from datetime import datetime
from html.parser import HTMLParser
from urllib.parse import urljoin

import httpx
from fastapi import APIRouter, Request
from starlette.responses import StreamingResponse

from .db import json_dumps, utcnow
from .errors import ApiError
from .models import Conversation
from .settings import AUDIO_ALLOWED_HOSTS, DEFAULT_SOURCE_GROUP_ID
from .audio_security import audio_destination, audio_get

router = APIRouter(prefix='/api')
log = logging.getLogger(__name__)


def timestamp_seconds(value):
    if not isinstance(value, str):
        raise ValueError('timestamp должен быть строкой')
    if re.fullmatch(r'\d+:\d{2}', value):
        minutes, seconds = map(int, value.split(':'))
        if seconds >= 60:
            raise ValueError('timestamp: секунды должны быть от 00 до 59')
        return minutes * 60 + seconds
    normalized = re.sub(r'(\.\d{6})\d+', r'\1', value).replace('Z', '+00:00')
    parsed = datetime.fromisoformat(normalized)
    if parsed.tzinfo is None:
        raise ValueError('timestamp: у времени ISO должен быть часовой пояс')
    return parsed.timestamp()


def normalize_records(payload, group_id, audio_allowed_hosts=AUDIO_ALLOWED_HOSTS, rejected_audio=None):
    if isinstance(payload, list):
        records = payload
    elif isinstance(payload, dict) and isinstance(payload.get('data'), dict):
        records = payload['data'].get('records')
    else:
        records = None
    if not isinstance(records, list):
        raise ApiError('invalid_transcript', 'Поле data.records должно быть массивом записей')
    seen, normalized = set(), []
    for record_idx, row in enumerate(records, 1):
        def fail(message):
            raise ApiError('invalid_transcript', f'Запись {record_idx}: {message}')
        if not isinstance(row, dict):
            fail('запись должна быть объектом')
        cid = row.get('conversation_id')
        if not isinstance(cid, str) or not cid.strip():
            fail('поле conversation_id должно быть непустой строкой')
        if cid in seen:
            fail(f'повторяется conversation_id {cid}')
        seen.add(cid)
        if row.get('channel') not in ('agent chat', 'voice call'):
            fail('неизвестное поле channel')
        if row.get('language') not in ('RU', 'KZ', 'EN'):
            fail('неизвестное поле language')
        raw_turns = row.get('transcript')
        if not isinstance(raw_turns, list) or not raw_turns:
            fail('поле transcript должно быть непустым массивом')
        turns, base = [], None
        for idx, turn in enumerate(raw_turns):
            if not isinstance(turn, dict):
                fail(f'реплика {idx + 1} должна быть объектом')
            if turn.get('speaker') not in ('operator', 'client', 'bot', 'system'):
                fail(f'у реплики {idx + 1} неизвестная роль {turn.get("speaker")}')
            if not isinstance(turn.get('text'), str) or not turn['text'].strip():
                fail(f'у реплики {idx + 1} поле text должно быть непустым')
            try:
                seconds = timestamp_seconds(turn.get('timestamp'))
            except (ValueError, TypeError, OverflowError):
                fail(f'у реплики {idx + 1} неверное поле timestamp: требуется MM:SS или ISO с часовым поясом')
            if base is None:
                base = seconds
            turns.append(dict(idx=idx, timestamp=turn['timestamp'], tSec=round(seconds - base, 6), speaker=turn['speaker'], text=turn['text']))
        audio = row.get('audio_url')
        if audio is not None:
            if not isinstance(audio, str):
                fail('audio_url должен быть строкой или null')
            try:
                audio_destination(audio, audio_allowed_hosts)
            except ValueError:
                audio = None
                if rejected_audio is not None:
                    rejected_audio.append(cid)
        digest = hashlib.sha256(json_dumps(turns).encode('utf-8')).hexdigest()
        normalized.append(dict(id=cid, datasetGroupId=group_id, channel=row['channel'], language=row['language'], audioUrl=audio, transcript=turns, importedAt=utcnow(), transcriptHash=digest))
    return normalized


def import_steps(db, payload, group_id, audio_allowed_hosts=AUDIO_ALLOWED_HOSTS, source=False):
    """Yield measured progress; records and sync receipt commit in one transaction."""
    rejected_audio = []
    records = normalize_records(payload, group_id, audio_allowed_hosts, rejected_audio)
    imported, updated = 0, 0
    new_ids, existing_ids = [], []
    yield dict(stage='importing', processed=0, total=len(records))
    with db.transaction() as conn:
        existing = {c['id']: c for c in db.all_conversations(conn)}
        for index, record in enumerate(records, 1):
            old = existing.get(record['id'])
            if old is None:
                imported += 1
                new_ids.append(record['id'])
            elif old['transcriptHash'] != record['transcriptHash']:
                updated += 1
            else:
                record['importedAt'] = old['importedAt']
            if old is not None:
                existing_ids.append(record['id'])
            if old and old['transcriptHash'] != record['transcriptHash']:
                db.invalidate_cache('summary', record['id'], conn)
                db.invalidate_cache('translation', record['id'], conn)
            db.save_conversation(record, conn)
            yield dict(stage='importing', processed=index, total=len(records))
        total = conn.execute('SELECT COUNT(*) FROM conversations WHERE group_id=?', (group_id,)).fetchone()[0]
        result = dict(groupId=group_id, imported=imported, updated=updated, unchanged=len(records)-imported-updated,
                      total=total, audioRejected=len(rejected_audio))
        if source:
            result = dict(imported=imported, updated=updated, unchanged=len(records)-imported-updated,
                          total=len(records), lastSyncAt=utcnow())
            db.set_setting('lastSyncAt', result['lastSyncAt'], conn)
            db.set_setting('lastResult', {k: result[k] for k in ('imported', 'updated', 'unchanged')}, conn)
        result.update(newConversationIds=new_ids, existingConversationIds=existing_ids)
    yield dict(stage='done', result=result, ids=[r['id'] for r in records])


def import_records(db, payload, group_id, audio_allowed_hosts=AUDIO_ALLOWED_HOSTS):
    for step in import_steps(db, payload, group_id, audio_allowed_hosts):
        if step['stage'] == 'done':
            return step['result'], step['ids']


def schedule_summaries(request, ids):
    if not request.app.state.settings.auto_summarize or not ids:
        return
    from .extras import prefetch_summaries
    task = asyncio.create_task(prefetch_summaries(request.app, ids))
    request.app.state.background_tasks.add(task)
    def finished(t):
        request.app.state.background_tasks.discard(t)
        if not t.cancelled() and t.exception():
            log.error('Background summaries failed (%s)', type(t.exception()).__name__)
    task.add_done_callback(finished)


async def schedule_import_work(request, result):
    """Only new records auto-process; existing records await the user's choice."""
    ids = result['newConversationIds']
    queued = request.app.state.stt.enqueue(ids)
    result.update(sttQueued=len(queued), sttConversationIds=queued, evaluationJob=None)
    if ids and request.app.state.settings.auto_evaluate_imports:
        checklist = request.app.state.db.get_checklist('active')
        accepted = await request.app.state.queue.submit(ids, checklist['id'], reuse=False)
        result['evaluationJob'] = {**accepted, 'checklistId': checklist['id'],
                                   'checklistVersion': checklist['version'], 'reuse': False}
    schedule_summaries(request, ids)


def source_group(body):
    group_id = body.get('groupId') if isinstance(body, dict) else None
    if not isinstance(group_id, str) or not group_id.strip() or len(group_id) > 100:
        raise ApiError('bad_group', 'Укажите непустой groupId длиной до 100 символов')
    return group_id.strip()


async def fetch_dataset(request, group_id):
    url = httpx.URL(request.app.state.settings.org_api_url).copy_add_param('group_id', group_id)
    async with httpx.AsyncClient(timeout=60, follow_redirects=True) as client:
        for attempt in range(2):
            try:
                response = await client.get(url)
                response.raise_for_status()
                payload = response.json()
                break
            except (httpx.HTTPError, ValueError):
                if attempt:
                    raise ApiError('upstream_failed', 'Не удалось загрузить набор у организаторов. Повторите запрос или загрузите JSON-файл', 502)
                await asyncio.sleep(0.3)
    if not isinstance(payload, dict):
        raise ApiError('upstream_failed', 'Организаторы вернули неверный формат набора', 502)
    if payload.get('isSuccess') is False:
        raise ApiError('bad_group', str(payload.get('error') or 'Организаторы не нашли указанный набор'))
    return payload


@router.post('/datasets/import')
async def import_dataset(request: Request):
    group_id = source_group(await request.json())
    payload = await fetch_dataset(request, group_id)
    result, ids = import_records(request.app.state.db, payload, group_id, request.app.state.settings.audio_allowed_hosts)
    await schedule_import_work(request, result)
    return result


@router.get('/source')
async def get_source(request: Request):
    db = request.app.state.db
    with db.transaction() as conn:
        return dict(groupId=db.get_setting('sourceGroupId', DEFAULT_SOURCE_GROUP_ID, conn),
                    lastSyncAt=db.get_setting('lastSyncAt', conn=conn),
                    lastResult=db.get_setting('lastResult', conn=conn))


@router.put('/source')
async def put_source(request: Request):
    group_id = source_group(await request.json())
    async with request.app.state.source_lock:
        db = request.app.state.db
        with db.transaction() as conn:
            if group_id != db.get_setting('sourceGroupId', DEFAULT_SOURCE_GROUP_ID, conn):
                db.set_setting('lastSyncAt', None, conn)
                db.set_setting('lastResult', None, conn)
            db.set_setting('sourceGroupId', group_id, conn)
    return dict(groupId=group_id)


@router.post('/source/sync')
async def sync_source(request: Request):
    async def steps():
        async with request.app.state.source_lock:
            db = request.app.state.db
            group_id = db.get_setting('sourceGroupId', DEFAULT_SOURCE_GROUP_ID)
            yield dict(stage='fetching')
            payload = await fetch_dataset(request, group_id)
            queue = asyncio.Queue()
            loop = asyncio.get_running_loop()
            def import_in_thread():
                try:
                    for step in import_steps(db, payload, group_id, request.app.state.settings.audio_allowed_hosts, source=True):
                        loop.call_soon_threadsafe(queue.put_nowait, step)
                except Exception as exc:
                    loop.call_soon_threadsafe(queue.put_nowait, exc)
            task = asyncio.create_task(asyncio.to_thread(import_in_thread))
            try:
                while True:
                    step = await queue.get()
                    if isinstance(step, Exception):
                        raise step
                    if step['stage'] == 'done':
                        step.pop('ids')
                        await schedule_import_work(request, step['result'])
                    yield step
                    if step['stage'] == 'done':
                        break
            finally:
                await asyncio.shield(task)

    if 'application/x-ndjson' in request.headers.get('accept', ''):
        async def stream():
            iterator = steps()
            try:
                async for step in iterator:
                    yield json_dumps(step) + '\n'
            except ApiError as exc:
                yield json_dumps(dict(stage='error', error=dict(code=exc.code,
                    message='CRM не ответила. Попробуйте ещё раз через минуту'))) + '\n'
            finally:
                await iterator.aclose()
        return StreamingResponse(stream(), media_type='application/x-ndjson',
                                 headers={'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no'})
    try:
        async for step in steps():
            if step['stage'] == 'done':
                result = step['result']
        return result
    except ApiError as exc:
        raise ApiError(exc.code, 'CRM не ответила. Попробуйте ещё раз через минуту', exc.status)


@router.post('/conversations/upload')
async def upload(request: Request):
    result, ids = import_records(request.app.state.db, await request.json(), 'UPLOAD', request.app.state.settings.audio_allowed_hosts)
    await schedule_import_work(request, result)
    return result


@router.get('/conversations')
async def list_conversations(request: Request, groupId: str = '', language: str = '', channel: str = '', status: str = '', q: str = ''):
    if status not in {'', 'new', 'running', 'done', 'failed', 'appeal', 'review', 'stale'}:
        raise ApiError('invalid_filter', 'Неизвестный фильтр состояния')
    if language not in {'', 'RU', 'KZ', 'EN'} or channel not in {'', 'agent chat', 'voice call'}:
        raise ApiError('invalid_filter', 'Неизвестный язык или канал')
    db, latest = request.app.state.db, {}
    for ev in db.all_evaluations():
        latest.setdefault(ev['conversationId'], ev)
    appeal_counts = {}
    for ap in db.all_appeals():
        counts = appeal_counts.setdefault(ap['evaluationId'], {'open': 0, 'decided': 0})
        counts['open' if ap['status'] == 'open' else 'decided'] += 1
    from .extras import get_cached_summary
    rows = []
    for conversation in reversed(db.all_conversations()):
        if groupId and conversation['datasetGroupId'] != groupId:
            continue
        if language and conversation['language'] != language or channel and conversation['channel'] != channel:
            continue
        if q and q.casefold() not in (conversation['id'] + '\n' + '\n'.join(t['text'] for t in conversation['transcript'])).casefold():
            continue
        ev = latest.get(conversation['id'])
        last = None
        if ev:
            counts = appeal_counts.get(ev['id'], {'open': 0, 'decided': 0})
            ev_status = ev['status'] if ev.get('transcriptHash') == conversation['transcriptHash'] else 'stale'
            last = dict(id=ev['id'], status=ev_status, total=ev['total'], originalTotal=ev['originalTotal'], grossFlagged=ev['grossError']['flagged'], checklistVersion=ev['checklistVersion'], openAppeals=counts['open'], decidedAppeals=counts['decided'], needsReviewCount=ev.get('needsReviewCount', 0), ribbon=[{k: item.get(k) for k in ('criterionId','answer','fraction','effectiveWeight')} for item in ev['items']])
        summary = get_cached_summary(db, conversation)
        turns = conversation['transcript']
        rows.append(dict(id=conversation['id'], number=conversation['number'], startedAt=conversation['startedAt'], groupId=conversation['datasetGroupId'], language=conversation['language'], channel=conversation['channel'], audioUrl=conversation['audioUrl'], transcriptHash=conversation['transcriptHash'], turns=len(turns), durationSec=turns[-1]['tSec'] if turns else 0, preview=next((t['text'][:140] for t in turns if t['speaker'] == 'client'), ''), lastEvaluation=last, summary=summary))
    counts = dict(all=len(rows), evaluated=sum(bool(r['lastEvaluation'] and r['lastEvaluation']['status'] == 'done') for r in rows), running=sum(bool(r['lastEvaluation'] and r['lastEvaluation']['status'] in {'running','queued'}) for r in rows), appealsOpen=sum(bool(r['lastEvaluation'] and r['lastEvaluation']['openAppeals']) for r in rows))
    def matches(row):
        ev = row['lastEvaluation']
        if not status:
            return True
        if status == 'new':
            return ev is None
        if ev is None:
            return False
        if status == 'running':
            return ev['status'] in {'queued', 'running'}
        if status == 'appeal':
            return ev['openAppeals'] > 0
        if status == 'review':
            return ev['needsReviewCount'] > 0
        return ev['status'] == status
    return dict(items=[r for r in rows if matches(r)], counts=counts)


@router.get('/conversations/{id}')
async def get_conversation(id: str, request: Request):
    return Conversation.model_validate(request.app.state.db.get_conversation(id)).model_dump(by_alias=True)


@router.get('/conversations/{id}/evaluations')
async def history(id: str, request: Request):
    from .evaluations import public_evaluation
    db = request.app.state.db
    db.get_conversation(id)
    return dict(items=[public_evaluation(ev) for ev in db.all_evaluations() if ev['conversationId'] == id])


class AudioSource(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.src = None

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'source' and attrs.get('src') and attrs.get('type', 'audio/mpeg') == 'audio/mpeg':
            self.src = attrs['src']


@router.get('/conversations/{id}/audio')
async def audio(id: str, request: Request):
    conversation = request.app.state.db.get_conversation(id)
    if not conversation['audioUrl']:
        raise ApiError('no_audio', 'У этого диалога нет аудиозаписи', 404)
    allowed_hosts = request.app.state.settings.audio_allowed_hosts
    client = httpx.AsyncClient(timeout=httpx.Timeout(60, connect=15), follow_redirects=False,
                              trust_env=False, limits=httpx.Limits(max_keepalive_connections=0))
    stream = None
    try:
        page, page_url = await audio_get(client, conversation['audioUrl'], allowed_hosts)
        try:
            page.raise_for_status()
            await page.aread()
            parser = AudioSource()
            parser.feed(page.text)
        finally:
            await page.aclose()
        if not parser.src:
            raise ValueError('no source')
        url = urljoin(page_url, parser.src)
        headers = {'Accept-Encoding': 'identity'}
        if request.headers.get('range'):
            headers['Range'] = request.headers['range']
        stream, _ = await audio_get(client, url, allowed_hosts, headers)
        if stream.status_code not in {200, 206, 416}:
            stream.raise_for_status()
            raise ValueError('invalid status')
        response_headers = {key: stream.headers[key] for key in ('content-range','content-length','accept-ranges') if key in stream.headers}
    except (httpx.HTTPError, ValueError, OSError, asyncio.TimeoutError):
        if stream is not None:
            await stream.aclose()
        await client.aclose()
        raise ApiError('upstream_failed', 'Не удалось получить аудиозапись у организаторов. Повторите запрос', 502)
    async def chunks():
        try:
            async for chunk in stream.aiter_raw():
                yield chunk
        finally:
            await stream.aclose()
            await client.aclose()
    return StreamingResponse(chunks(), status_code=stream.status_code, media_type='audio/mpeg', headers=response_headers)

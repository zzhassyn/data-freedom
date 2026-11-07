"""A bounded single-process worker backed by durable transcription rows."""
import asyncio
import logging
import tempfile
import time
from pathlib import Path

from ..errors import ApiError
from . import audio, provider
from .storage import Store

log = logging.getLogger(__name__)
INTERRUPTED = 'Расшифровка прервалась. Повторите её'


class StaleJob(Exception):
    pass


class TranscriptionQueue:
    def __init__(self, db, settings):
        self.db, self.settings = db, settings
        self.store = Store(db, settings.stt_keep_raw)
        self.queue = asyncio.Queue()
        self.scheduled = set()
        self.workers = []

    async def start(self):
        if not self.settings.stt_enabled or not self.settings.openrouter_api_key:
            return
        for row in self.store.all():
            if row['status'] not in {'queued', 'running'}:
                continue
            cid, generation = row['conversation_id'], row['generation']
            if row['step'] in {'queued', 'download'}:
                self.store.update(cid, generation, status='queued', step='queued', progress=0, error=None)
                self._schedule(cid, generation)
            else:
                # No raw response is durable by default. An unknown paid outcome must not be replayed.
                self.store.update(cid, generation, status='failed', step='failed', error=INTERRUPTED,
                                  turns=[], speakers=[])
        self.workers = [asyncio.create_task(self._worker()) for _ in range(self.settings.stt_concurrency)]

    async def close(self):
        for worker in self.workers:
            worker.cancel()
        await asyncio.gather(*self.workers, return_exceptions=True)
        self.workers.clear()

    def _schedule(self, cid, generation):
        key = (cid, generation)
        if key not in self.scheduled:
            self.scheduled.add(key)
            self.queue.put_nowait(key)

    def enqueue(self, ids, force=False):
        if not self.settings.stt_enabled or not self.settings.openrouter_api_key:
            return []
        accepted = self.store.enqueue(ids, self.settings.stt_model, force)
        for cid, generation in accepted:
            self._schedule(cid, generation)
        return [cid for cid, _ in accepted]

    def _change(self, cid, generation, **fields):
        if not self.store.update(cid, generation, **fields):
            raise StaleJob()

    async def _worker(self):
        while True:
            cid, generation = await self.queue.get()
            try:
                await self._run(cid, generation)
            finally:
                self.scheduled.discard((cid, generation))
                self.queue.task_done()

    async def _recognize(self, cid, generation, path, seconds):
        task = asyncio.create_task(provider.transcribe(path, self.settings))
        began = time.monotonic()
        expected = max(1, (seconds or 0) * 0.05)
        try:
            while not task.done():
                done, _ = await asyncio.wait({task}, timeout=1)
                if not done:
                    # This is an estimate of the waiting step, never a claimed provider percentage.
                    progress = 25 + 50 * min(0.95, (time.monotonic() - began) / expected)
                    self._change(cid, generation, progress=round(progress, 1))
            return await task
        finally:
            if not task.done():
                task.cancel()
                await asyncio.gather(task, return_exceptions=True)

    async def _run(self, cid, generation):
        from .processing import PrivacyError, prepare, mask_prepared, build, annotate_roles
        row = self.store.get(cid)
        if not row or row['generation'] != generation or row['status'] != 'queued':
            return
        step = 'download'
        try:
            if not self.settings.openrouter_api_key:
                raise provider.TranscriptionError('Сервис распознавания не настроен')
            conversation = self.db.get_conversation(cid)
            self._change(cid, generation, status='running', step=step, progress=5)
            with tempfile.TemporaryDirectory(prefix='da-stt-') as temp:
                path = Path(temp) / 'recording.mp3'
                try:
                    declared = await asyncio.wait_for(audio.download_audio(
                        conversation['audioUrl'], self.settings.audio_allowed_hosts, path), timeout=120)
                except asyncio.TimeoutError as exc:
                    raise provider.TranscriptionError('Не удалось скачать запись') from exc
                info = await audio.inspect_audio(path, declared)
                self._change(cid, generation, audio_seconds_declared=info.declared,
                             audio_seconds_decoded=info.decoded, incomplete=info.incomplete, audio_check=info.check)
                step = 'transcribe'
                self._change(cid, generation, step=step, progress=25)
                began = time.monotonic()
                raw = await self._recognize(cid, generation, path, info.decoded or info.declared)
                seconds, cost = provider.billed_usage(raw, self.settings.stt_price_per_sec)
                # Usage survives later masking failures, and contains no response content.
                self.db.record_usage({'costUsd': cost, 'calls': 1},
                                     latency_ms=int((time.monotonic() - began) * 1000), kind='transcription')
                self._change(cid, generation, seconds_billed=seconds, cost_usd=cost)
                step = 'mask'
                self._change(cid, generation, step=step, progress=80)
                prepared = await asyncio.to_thread(prepare, raw['words'], conversation['transcript'])
                masked = await asyncio.to_thread(mask_prepared, prepared)
                del prepared
                step = 'build'
                self._change(cid, generation, step=step, progress=95)
                result = await asyncio.to_thread(build, masked)
                result['turns'] = await asyncio.to_thread(annotate_roles, result['turns'],
                                                         result['speakers'], conversation['transcript'])
                self.store.finish(cid, generation, result, raw if self.settings.stt_keep_raw else None)
        except StaleJob:
            return
        except asyncio.CancelledError:
            if step == 'download':
                self.store.update(cid, generation, status='queued', step='queued', progress=0)
            else:
                self.store.update(cid, generation, status='failed', step='failed', error=INTERRUPTED,
                                  turns=[], speakers=[])
            raise
        except PrivacyError:
            self.store.update(cid, generation, status='failed', step='failed',
                              error='Не удалось безопасно скрыть личные данные. Повторите расшифровку',
                              turns=[], speakers=[])
        except provider.TranscriptionError as exc:
            self.store.update(cid, generation, status='failed', step='failed', error=str(exc), turns=[], speakers=[])
        except Exception as exc:
            log.warning('Transcription failed at %s (%s)', step, type(exc).__name__)
            self.store.update(cid, generation, status='failed', step='failed',
                              error='Не удалось обработать расшифровку. Повторите её', turns=[], speakers=[])

    def transcription(self, cid):
        from ..translation_service import transcription_source_hash
        from .processing import annotate_roles
        conversation = self.db.get_conversation(cid)
        row = self.store.get(cid) if self.settings.stt_enabled else None
        status = row['status'] if row else 'not_queued' if self.settings.stt_enabled else 'disabled'
        result = {
            'status': status, 'step': row['step'] if row else status, 'progress': row['progress'] if row else 0,
            'error': row['error'] if row else None, 'transcriptHash': conversation['transcriptHash'],
            'turns': row['turns'] if row and status == 'done' else [],
            'speakers': row['speakers'] if row and status == 'done' else [],
            'incomplete': row['incomplete'] if row else False,
            'audioSecondsDeclared': row['audio_seconds_declared'] if row else None,
            'audioSecondsDecoded': row['audio_seconds_decoded'] if row else None,
            'costUsd': row['cost_usd'] if row else 0, 'model': row['model'] if row else self.settings.stt_model,
            'audioCheck': row['audio_check'] if row else 'pending',
        }
        if status == 'done':
            # Store.get only returns rows for the current organizer transcript.
            # Re-annotate old paid results in memory; no provider call or write.
            result['turns'] = annotate_roles(result['turns'], result['speakers'], conversation['transcript'])
        result['sourceHash'] = transcription_source_hash(result) if status == 'done' else None
        return result

    def jobs(self, group_id=None):
        rows = self.store.all(group_id) if self.settings.stt_enabled else []
        conversations = {c['id']: c for c in self.db.all_conversations()}
        items = []
        for row in rows:
            conversation = conversations[row['conversation_id']]
            items.append({
                'conversationId': row['conversation_id'], 'number': conversation['number'],
                'transcriptHash': row['transcript_hash'],
                'status': row['status'], 'step': row['step'], 'progress': row['progress'], 'error': row['error'],
                'durationSec': row['audio_seconds_declared'] or conversation['transcript'][-1]['tSec'],
                'audioSecondsDeclared': row['audio_seconds_declared'], 'audioSecondsDecoded': row['audio_seconds_decoded'],
                'incomplete': row['incomplete'],
            })
        return {'enabled': self.settings.stt_enabled, 'total': len(items), 'items': items,
                **{status: sum(item['status'] == status for item in items) for status in ('done', 'failed', 'running', 'queued')}}

    def retry(self, cid, force=False):
        conversation = self.db.get_conversation(cid)
        if not self.settings.stt_enabled:
            raise ApiError('stt_disabled', 'Расшифровка звонков выключена', 409)
        if conversation['channel'] != 'voice call' or not conversation.get('audioUrl'):
            raise ApiError('no_audio', 'У этого обращения нет аудиозаписи', 404)
        if not self.settings.openrouter_api_key:
            raise ApiError('model_unavailable', 'Расшифровка недоступна: настройте ключ OpenRouter', 503)
        self.enqueue([cid], force=force)
        return self.transcription(cid)

"""Bounded Scribe transport. Provider bodies and credentials never enter logs."""
import asyncio
import base64
import math

import httpx


class TranscriptionError(Exception):
    """A safe, user-facing failure; never include provider response text."""


async def transcribe(path, settings):
    if not settings.openrouter_api_key:
        raise TranscriptionError('Сервис распознавания не настроен')
    audio = await asyncio.to_thread(path.read_bytes)
    body = {
        'model': settings.stt_model,
        'input_audio': {'data': base64.b64encode(audio).decode('ascii'), 'format': 'mp3'},
        'response_format': 'verbose_json',
        'timestamp_granularities': ['segment', 'word'],
        'provider': {'options': {'elevenlabs': {'diarize': True}}},
    }
    async with httpx.AsyncClient(timeout=120, follow_redirects=False, trust_env=False) as client:
        for attempt in range(2):
            try:
                response = await asyncio.wait_for(client.post(
                    'https://openrouter.ai/api/v1/audio/transcriptions', json=body,
                    headers={'Authorization': 'Bearer ' + settings.openrouter_api_key}), timeout=120)
            except (httpx.HTTPError, asyncio.TimeoutError) as exc:
                raise TranscriptionError('Сервис распознавания не ответил') from exc
            if response.status_code == 429 or 500 <= response.status_code < 600:
                if attempt == 0:
                    await asyncio.sleep(3)
                    continue
            if not response.is_success:
                raise TranscriptionError('Сервис распознавания не ответил')
            try:
                result = response.json()
                if not isinstance(result, dict) or not isinstance(result.get('words'), list) or not result['words']:
                    raise ValueError('missing words')
            except (ValueError, TypeError) as exc:
                raise TranscriptionError('Сервис распознавания вернул неполный ответ') from exc
            return result
    raise TranscriptionError('Сервис распознавания не ответил')


def billed_usage(result, price_per_second):
    usage = result.get('usage') or {}
    seconds = usage.get('seconds', result.get('duration', 0))
    if isinstance(seconds, bool) or not isinstance(seconds, (int, float)) or not math.isfinite(seconds) or seconds < 0:
        raise TranscriptionError('Сервис распознавания вернул неверную длительность')
    return float(seconds), float(seconds) * price_per_second

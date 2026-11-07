"""Use the audio proxy's checked destinations, then measure a full local decode."""
import asyncio
import math
import re
import shutil
from dataclasses import dataclass
from urllib.parse import urljoin

import httpx

from ..audio_security import audio_get
from ..conversations import AudioSource
from .provider import TranscriptionError

MAX_AUDIO_BYTES = 50 * 1024 * 1024


def positive_seconds(value):
    try:
        number = float(value)
        return number if math.isfinite(number) and number > 0 else None
    except (TypeError, ValueError):
        return None


@dataclass
class AudioInfo:
    declared: float | None = None
    decoded: float | None = None
    incomplete: bool = False
    check: str = 'pending'


async def download_audio(url, allowed_hosts, path):
    """Return optional declared duration; caller owns the temporary file's lifetime."""
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(60, connect=15), follow_redirects=False,
                                     trust_env=False, limits=httpx.Limits(max_keepalive_connections=0)) as client:
            page, page_url = await audio_get(client, url, allowed_hosts)
            try:
                page.raise_for_status()
                parts, size = [], 0
                async for chunk in page.aiter_bytes():
                    size += len(chunk)
                    if size > 1024 * 1024:
                        raise ValueError('oversized audio page')
                    parts.append(chunk)
                parser = AudioSource()
                parser.feed(b''.join(parts).decode('utf-8', errors='replace'))
            finally:
                await page.aclose()
            if not parser.src:
                raise ValueError('missing audio source')
            response, _ = await audio_get(client, urljoin(page_url, parser.src), allowed_hosts,
                                          {'Accept-Encoding': 'identity'})
            try:
                response.raise_for_status()
                if response.status_code != 200:
                    raise ValueError('partial audio download')
                length = response.headers.get('content-length')
                if length and int(length) > MAX_AUDIO_BYTES:
                    raise ValueError('oversized audio')
                declared = positive_seconds(response.headers.get('content-duration')
                                            or response.headers.get('x-content-duration'))
                size = 0
                with path.open('wb') as output:
                    async for chunk in response.aiter_bytes():
                        size += len(chunk)
                        if size > MAX_AUDIO_BYTES:
                            raise ValueError('oversized audio')
                        output.write(chunk)
                if size == 0:
                    raise ValueError('empty audio')
                return declared
            finally:
                await response.aclose()
    except (httpx.HTTPError, ValueError, OSError, asyncio.TimeoutError) as exc:
        raise TranscriptionError('Не удалось скачать запись') from exc


async def command(*args):
    process = await asyncio.create_subprocess_exec(*args, stdout=asyncio.subprocess.PIPE,
                                                  stderr=asyncio.subprocess.PIPE)
    try:
        stdout, stderr = await asyncio.wait_for(process.communicate(), timeout=120)
        return process.returncode, stdout.decode('utf-8', errors='replace'), stderr.decode('utf-8', errors='replace')
    except BaseException:
        if process.returncode is None:
            process.kill()
            await process.wait()
        raise


async def inspect_audio(path, declared=None):
    info = AudioInfo(declared=positive_seconds(declared))
    ffprobe, ffmpeg = shutil.which('ffprobe'), shutil.which('ffmpeg')
    try:
        if ffprobe:
            code, stdout, _ = await command(ffprobe, '-v', 'error', '-show_entries', 'format=duration',
                                            '-of', 'default=noprint_wrappers=1:nokey=1', str(path))
            if code == 0:
                info.declared = info.declared or positive_seconds(stdout.strip())
        if not ffmpeg:
            info.check = 'unavailable'
            return info
        code, stdout, stderr = await command(ffmpeg, '-v', 'error', '-i', str(path), '-progress', 'pipe:1',
                                             '-nostats', '-f', 'null', '-')
        values = re.findall(r'^out_time_us=(\d+)\s*$', stdout, re.M)
        if values:
            info.decoded = positive_seconds(int(values[-1]) / 1_000_000)
        if info.decoded is None:
            raise TranscriptionError('Запись повреждена')
        info.incomplete = bool(info.declared and info.declared - info.decoded > 5)
        # A truncated recording with a decodable beginning is useful and explicitly flagged.
        if code and not info.incomplete:
            raise TranscriptionError('Запись повреждена')
        info.check = 'incomplete' if info.incomplete else 'decoded_with_warnings' if stderr.strip() else 'checked'
        return info
    except (OSError, asyncio.TimeoutError) as exc:
        raise TranscriptionError('Не удалось проверить запись') from exc

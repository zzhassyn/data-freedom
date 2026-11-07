"""Environment configuration, paths resolved relative to backend/."""
import os
import math
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parents[1]
load_dotenv(BASE_DIR / '.env', encoding='utf-8-sig')
AUDIO_ALLOWED_HOSTS = ('.environment.api.powerplatform.com', '.dynamics.com')
DEFAULT_SOURCE_GROUP_ID = 'DEV'
DEFAULT_ORG_API_URL = ('https://ec88f21f1accecf38e20095a9fe175.a5.environment.api.powerplatform.com:443'
    '/powerautomate/automations/direct/cu/11/workflows/b3d2a68006a24662be2b721454cb4e00'
    '/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0'
    '&sig=5Sog2MThgCRTlk3HObv70LRmRk6u7IOwzlwMpe804qo')


def env_bool(name, default):
    return os.getenv(name, str(default)).strip().lower() in {'1', 'true', 'yes', 'on'}


@dataclass
class Settings:
    db_path: str = field(default_factory=lambda: os.getenv('DB_PATH', './data/cqa.sqlite'))
    org_api_url: str = field(default_factory=lambda: os.getenv('ORG_API_URL', DEFAULT_ORG_API_URL))
    audio_allowed_hosts: tuple[str, ...] = field(default_factory=lambda: tuple(
        os.getenv('AUDIO_ALLOWED_HOSTS', ','.join(AUDIO_ALLOWED_HOSTS)).split(',')))
    judge: str = field(default_factory=lambda: os.getenv('JUDGE', 'fake'))
    llm_base_url: str = field(default_factory=lambda: os.getenv('LLM_BASE_URL', 'https://api.openai.com/v1'))
    llm_api_key: str = field(default_factory=lambda: os.getenv('LLM_API_KEY', ''))
    llm_model: str = field(default_factory=lambda: os.getenv('LLM_MODEL', ''))
    llm_price_in: float = field(default_factory=lambda: float(os.getenv('LLM_PRICE_IN', '0')))
    llm_price_out: float = field(default_factory=lambda: float(os.getenv('LLM_PRICE_OUT', '0')))
    judge_concurrency: int = field(default_factory=lambda: int(os.getenv('JUDGE_CONCURRENCY', '8')))
    fake_delay: float = field(default_factory=lambda: float(os.getenv('FAKE_DELAY', '0.4')))
    auto_summarize: bool = field(default_factory=lambda: os.getenv('AUTO_SUMMARIZE', '1') == '1')
    auto_evaluate_imports: bool = field(default_factory=lambda: env_bool('AUTO_EVALUATE_IMPORTS', True))
    openrouter_api_key: str = field(default_factory=lambda: os.getenv('OPENROUTER_API_KEY', ''), repr=False)
    translation_model: str = field(default_factory=lambda: os.getenv('TRANSLATION_MODEL', 'google/gemini-3.1-flash-lite'))
    stt_enabled: bool = field(default_factory=lambda: env_bool('STT_ENABLED', True))
    stt_model: str = field(default_factory=lambda: os.getenv('STT_MODEL', 'elevenlabs/scribe-v2'))
    stt_price_per_sec: float = field(default_factory=lambda: float(os.getenv('STT_PRICE_PER_SEC', '0.0000611')))
    stt_concurrency: int = field(default_factory=lambda: int(os.getenv('STT_CONCURRENCY', '3')))
    stt_keep_raw: bool = field(default_factory=lambda: env_bool('STT_KEEP_RAW', False))
    model_timeout: float = 90.0

    def __post_init__(self):
        hosts = self.audio_allowed_hosts
        if isinstance(hosts, str):
            hosts = hosts.split(',')
        self.audio_allowed_hosts = tuple(host.strip().strip('.').lower() for host in hosts if host.strip().strip('.'))
        if self.judge not in {'fake', 'real'}:
            raise ValueError('JUDGE должен быть fake или real')
        if not 1 <= self.judge_concurrency <= 128:
            raise ValueError('JUDGE_CONCURRENCY должен быть от 1 до 128')
        if self.fake_delay < 0:
            raise ValueError('FAKE_DELAY не может быть отрицательным')
        if not 1 <= self.stt_concurrency <= 16:
            raise ValueError('STT_CONCURRENCY должен быть от 1 до 16')
        if not math.isfinite(self.stt_price_per_sec) or self.stt_price_per_sec < 0:
            raise ValueError('STT_PRICE_PER_SEC должен быть конечным неотрицательным числом')
        path = Path(self.db_path)
        self.db_path = str(path if path.is_absolute() else BASE_DIR / path)

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
    db_url: str = field(default_factory=lambda: os.getenv('TURSO_DATABASE_URL', '').strip())
    db_auth_token: str = field(default_factory=lambda: os.getenv('TURSO_AUTH_TOKEN', '').strip(), repr=False)
    worker_mode: str = field(default_factory=lambda: os.getenv('WORKER_MODE', 'standalone').strip())
    org_api_url: str = field(default_factory=lambda: os.getenv('ORG_API_URL', DEFAULT_ORG_API_URL))
    audio_allowed_hosts: tuple[str, ...] = field(default_factory=lambda: tuple(
        os.getenv('AUDIO_ALLOWED_HOSTS', ','.join(AUDIO_ALLOWED_HOSTS)).split(',')))
    judge: str = field(default_factory=lambda: os.getenv('JUDGE', 'openrouter'))
    judge_model: str = field(default_factory=lambda: os.getenv('JUDGE_MODEL', '').strip())
    judge_temperature: float = field(default_factory=lambda: float(os.getenv('JUDGE_TEMPERATURE', '0')))
    judge_output_mode: str = field(default_factory=lambda: os.getenv('JUDGE_OUTPUT_MODE', 'tool'))
    judge_max_tokens: int = field(default_factory=lambda: int(os.getenv('JUDGE_MAX_TOKENS', '8192')))
    ai_model: str = field(default_factory=lambda: os.getenv('AI_MODEL', '').strip() or os.getenv('JUDGE_MODEL', '').strip())
    llm_base_url: str = field(default_factory=lambda: os.getenv('LLM_BASE_URL', 'https://api.openai.com/v1'))
    llm_api_key: str = field(default_factory=lambda: os.getenv('LLM_API_KEY', ''))
    llm_model: str = field(default_factory=lambda: os.getenv('LLM_MODEL', ''))
    llm_price_in: float = field(default_factory=lambda: float(os.getenv('LLM_PRICE_IN', '0')))
    llm_price_out: float = field(default_factory=lambda: float(os.getenv('LLM_PRICE_OUT', '0')))
    judge_concurrency: int = field(default_factory=lambda: int(os.getenv('JUDGE_CONCURRENCY', '8')))
    auto_summarize: bool = field(default_factory=lambda: os.getenv('AUTO_SUMMARIZE', '1') == '1')
    auto_evaluate_imports: bool = field(default_factory=lambda: env_bool('AUTO_EVALUATE_IMPORTS', True))
    openrouter_api_key: str = field(default_factory=lambda: os.getenv('OPENROUTER_API_KEY', ''), repr=False)
    translation_model: str = field(default_factory=lambda: os.getenv('TRANSLATION_MODEL', 'google/gemini-3.1-flash-lite'))
    stt_enabled: bool = field(default_factory=lambda: env_bool('STT_ENABLED', True))
    stt_model: str = field(default_factory=lambda: os.getenv('STT_MODEL', 'elevenlabs/scribe-v2'))
    stt_price_per_sec: float = field(default_factory=lambda: float(os.getenv('STT_PRICE_PER_SEC', '0.0000611')))
    stt_concurrency: int = field(default_factory=lambda: int(os.getenv('STT_CONCURRENCY', '3')))
    stt_keep_raw: bool = field(default_factory=lambda: env_bool('STT_KEEP_RAW', False))
    model_timeout: float = field(default_factory=lambda: float(os.getenv('MODEL_TIMEOUT_SECONDS', '180')))

    def __post_init__(self):
        if self.worker_mode not in {'standalone', 'api', 'worker'}:
            raise ValueError('WORKER_MODE должен быть standalone, api или worker')
        if bool(self.db_url) != bool(self.db_auth_token):
            raise ValueError('TURSO_DATABASE_URL и TURSO_AUTH_TOKEN задаются вместе')
        if self.worker_mode == 'api' and not self.db_url:
            raise ValueError('Серверный API требует постоянную базу TURSO_DATABASE_URL')
        hosts = self.audio_allowed_hosts
        if isinstance(hosts, str):
            hosts = hosts.split(',')
        self.audio_allowed_hosts = tuple(host.strip().strip('.').lower() for host in hosts if host.strip().strip('.'))
        if self.judge not in {'real', 'openrouter'}:
            raise ValueError('JUDGE должен быть real или openrouter')
        if not math.isfinite(self.judge_temperature) or not 0 <= self.judge_temperature <= 2:
            raise ValueError('JUDGE_TEMPERATURE должен быть от 0 до 2')
        if self.judge_output_mode not in {'tool', 'schema'}:
            raise ValueError('JUDGE_OUTPUT_MODE должен быть tool или schema')
        if type(self.judge_max_tokens) is not int or not 1024 <= self.judge_max_tokens <= 32768:
            raise ValueError('JUDGE_MAX_TOKENS должен быть целым числом от 1024 до 32768')
        if not math.isfinite(self.model_timeout) or not 0 < self.model_timeout <= 600:
            raise ValueError('MODEL_TIMEOUT_SECONDS должен быть конечным числом больше 0 и не больше 600')
        if not 1 <= self.judge_concurrency <= 128:
            raise ValueError('JUDGE_CONCURRENCY должен быть от 1 до 128')
        if not 1 <= self.stt_concurrency <= 16:
            raise ValueError('STT_CONCURRENCY должен быть от 1 до 16')
        if not math.isfinite(self.stt_price_per_sec) or self.stt_price_per_sec < 0:
            raise ValueError('STT_PRICE_PER_SEC должен быть конечным неотрицательным числом')
        path = Path(self.db_path)
        self.db_path = str(path if path.is_absolute() else BASE_DIR / path)

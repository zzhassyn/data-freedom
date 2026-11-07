"""Select the injected ML modules without coupling HTTP routes to providers."""

import importlib
import os
from types import ModuleType

from .errors import JudgeError

_judge = "openrouter"
_settings = None
_providers = {}


def configure(judge: str = "openrouter", settings=None, providers=None) -> None:
    """Explicit dependency injection; normal startup supplies no provider overrides."""
    global _judge, _settings, _providers
    _judge = judge
    _settings = settings
    _providers = dict(providers or {})


def _get(kind: str) -> ModuleType:
    if kind in _providers:
        return _providers[kind]
    mode = current_mode()
    if mode not in {"real", "openrouter"}:
        raise JudgeError("JUDGE должен быть real или openrouter")
    module_name = f"app.{kind}.openrouter" if mode == "openrouter" else f"app.{kind}"
    try:
        module = importlib.import_module(module_name)
    except ImportError as exc:
        raise JudgeError("Модуль модели не подключён. Проверьте настройки сервера") from exc
    if getattr(module, "IS_FAKE", False):
        raise JudgeError("Настоящая модель не подключена. Проверьте настройки сервера")
    if _settings is not None and hasattr(module, "configure"):
        module.configure(_settings)
    return module


def current_mode() -> str:
    return os.getenv("JUDGE", _judge)


def get_judge() -> ModuleType:
    return _get("judge")


def get_ai() -> ModuleType:
    return _get("ai")


def has_provider_overrides() -> bool:
    return bool(_providers)


def provider_configured(kind: str, settings=None) -> bool:
    if kind in _providers:
        return True
    config = settings or _settings
    if config is None:
        return False
    model = (getattr(config, 'judge_model', '') if kind == 'judge' else
             getattr(config, 'ai_model', '') or getattr(config, 'judge_model', ''))
    return bool(getattr(config, 'openrouter_api_key', '') and model)

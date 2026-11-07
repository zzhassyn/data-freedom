"""Select the injected ML modules without coupling HTTP routes to providers."""

import importlib
import logging
import os
from types import ModuleType

from .errors import JudgeError

logger = logging.getLogger(__name__)
_judge = "fake"
_fake_delay = 0.4
_fallbacks: dict[str, bool] = {"judge": False, "ai": False}
_settings = None


def configure(judge: str = "fake", fake_delay: float = 0.4, settings=None) -> None:
    global _judge, _fake_delay, _settings
    _judge = judge
    _fake_delay = fake_delay
    _settings = settings
    _fallbacks.update(judge=False, ai=False)


def _get(kind: str) -> ModuleType:
    mode = os.getenv("JUDGE", _judge)
    if mode not in {"fake", "real", "openrouter"}:
        raise ValueError("JUDGE должен быть fake, real или openrouter")
    module_name = f"app.{kind}.{mode}" if mode in {"fake", "openrouter"} else f"app.{kind}"
    try:
        module = importlib.import_module(module_name)
        _fallbacks[kind] = False
    except ImportError as exc:
        raise JudgeError("Модуль модели не подключён. Проверьте настройки сервера") from exc
    if mode != "fake" and getattr(module, "IS_FAKE", False):
        raise JudgeError("Настоящая модель не подключена. Проверьте настройки сервера")
    if mode != "fake" and _settings is not None and hasattr(module, "configure"):
        module.configure(_settings)
    # Explicit, inspectable fake configuration; does not change provider inputs.
    if getattr(module, "IS_FAKE", False):
        fake = importlib.import_module(f"app.{kind}.fake")
        fake.DELAY_SECONDS = _fake_delay
    return module


def get_judge() -> ModuleType:
    return _get("judge")


def get_ai() -> ModuleType:
    return _get("ai")


def fallback_info() -> dict[str, bool]:
    return dict(_fallbacks)

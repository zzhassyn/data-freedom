"""Select the injected ML modules without coupling HTTP routes to providers."""

import importlib
import logging
import os
from types import ModuleType

logger = logging.getLogger(__name__)
_judge = "fake"
_fake_delay = 0.4
_fallbacks: dict[str, bool] = {"judge": False, "ai": False}


def configure(judge: str = "fake", fake_delay: float = 0.4) -> None:
    global _judge, _fake_delay
    _judge = judge
    _fake_delay = fake_delay
    _fallbacks.update(judge=False, ai=False)


def _get(kind: str) -> ModuleType:
    mode = os.getenv("JUDGE", _judge)
    if mode not in {"fake", "real"}:
        raise ValueError("JUDGE должен быть fake или real")
    module_name = f"app.{kind}.fake" if mode == "fake" else f"app.{kind}"
    try:
        module = importlib.import_module(module_name)
        _fallbacks[kind] = False
    except Exception:
        if mode != "real":
            raise
        logger.exception("Не удалось загрузить модуль %s; используется fake", module_name)
        _fallbacks[kind] = True
        module = importlib.import_module(f"app.{kind}.fake")
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

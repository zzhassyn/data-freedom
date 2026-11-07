"""Deterministic fixtures, never a substitute for a provider on unknown inputs.

fixtures.json was converted once from web/data/mock-evaluations.js. Runtime
does not execute JavaScript or depend on the frontend files.
"""

import asyncio
import json
import time
from pathlib import Path

from app.errors import JudgeError
from app.models import Conversation, Criterion, Evidence, JudgeResult, SecondOpinion, Usage

IS_FAKE = True
DELAY_SECONDS = 0.001
FIXTURES = json.loads(Path(__file__).with_name("fixtures.json").read_text(encoding="utf-8"))


def configured_model():
    return 'fake'


def _fixture(conversation: Conversation, criterion: Criterion) -> dict:
    data = FIXTURES.get(conversation.id)
    if data is None:
        raise JudgeError("Нет заготовки для этого диалога")
    if criterion.id not in data:
        raise JudgeError("Нет заготовки для этого критерия")
    return data[criterion.id]


async def judge(conversation: Conversation, criterion: Criterion) -> JudgeResult:
    started = time.monotonic()
    await asyncio.sleep(DELAY_SECONDS * (1 + criterion.order % 3))
    data = _fixture(conversation, criterion)
    evidence = []
    for idx, quote, kind in data.get("evidence", []):
        turn = next((turn for turn in conversation.transcript if turn.idx == idx), None)
        if turn is None or quote not in turn.text or len(quote) > 200:
            raise JudgeError("Транскрипт изменился: цитата из заготовки не найдена")
        evidence.append(Evidence(turn_idx=idx, quote=quote, kind=kind))
    return JudgeResult(
        answer=data["answer"],
        explanation=data.get("explanation") or data.get("naReason") or "Тестовый ответ по заготовке.",
        evidence=evidence,
        checked_range=tuple(data["range"]) if data.get("range") else None,
        na_reason=data.get("naReason"),
        flag_types=data.get("flagTypes"),
        needs_review=data.get("needsReview", False),
        model="fake",
        usage=Usage(input_tokens=0, output_tokens=0, cost_usd=0, calls=1),
        latency_ms=round((time.monotonic() - started) * 1000),
    )


async def second_opinion(
    conversation: Conversation,
    criterion: Criterion,
    original: JudgeResult,
    appeal_comment: str,
) -> SecondOpinion:
    result = await judge(conversation, criterion)
    # The only canned alternative is the example appeal supplied with the mock.
    changed = conversation.id == "p1-ru-001" and criterion.id == "closing"
    return SecondOpinion(
        answer="yes" if changed else result.answer,
        agrees_with_appeal=changed,
        explanation=(
            "Клиент подтвердил, что нашёл тариф; оператор ответил и попрощался. "
            "В тестовом повторном мнении это считается завершением."
            if changed else "Тестовое повторное мнение сохраняет исходный ответ по этому критерию."
        ),
        evidence=result.evidence,
        usage=result.usage,
    )

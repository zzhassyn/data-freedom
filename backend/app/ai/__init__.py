"""Real AI entry point; explicit fake mode imports app.ai.fake directly."""

from .openrouter import (
    IS_FAKE, cache_identity, coach, coach_stream, configure, second_opinion,
    suggest_criterion, summarize, summarize_stream,
)

__all__ = ["summarize", "summarize_stream", "coach", "coach_stream", "suggest_criterion",
           "second_opinion", "configure", "cache_identity"]

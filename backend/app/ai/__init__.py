"""AI integration point: replace these exports with the ML team's functions."""

from .fake import IS_FAKE, coach, suggest_criterion, summarize, translate

__all__ = ["summarize", "translate", "coach", "suggest_criterion"]

"""Prepared adapters are test dependencies and never imported by app startup."""
from . import ai, judge

PROVIDERS = {'judge': judge, 'ai': ai}

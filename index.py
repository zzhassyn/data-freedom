"""Vercel's HTTP entrypoint; durable background work belongs to the daemon."""
import os
from pathlib import Path
import sys

os.environ["WORKER_MODE"] = "api"
sys.path.insert(0, str(Path(__file__).resolve().parent / "backend"))

from app.main import app

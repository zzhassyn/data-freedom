"""Single leased daemon: python -m app.worker (WORKER_MODE=worker)."""
import asyncio
import logging
import signal
from contextlib import suppress

from .background import LeaseLost, SummaryJobs, WorkerLease
from .db import Database
from .settings import Settings

log = logging.getLogger(__name__)


async def serve(settings=None, stop=None):
    config = settings or Settings(worker_mode='worker')
    if config.worker_mode != 'worker':
        raise ValueError('The daemon requires WORKER_MODE=worker')
    stop = stop or asyncio.Event()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGTERM, signal.SIGINT):
        with suppress(NotImplementedError):
            loop.add_signal_handler(sig, stop.set)
    db = Database(config.db_path, remote_url=config.db_url, auth_token=config.db_auth_token)
    lease = WorkerLease(db)
    while not stop.is_set() and not lease.acquire():
        with suppress(asyncio.TimeoutError):
            await asyncio.wait_for(stop.wait(), timeout=5)
    if stop.is_set():
        return
    summary_task = None
    try:
        from .main import create_app
        app = create_app(config, background_guard=lease.check)
        async with app.router.lifespan_context(app):
            summaries = SummaryJobs(app.state.db, lease.check)
            summaries.recover()
            log.info('Background worker acquired ownership')
            while not stop.is_set():
                lease.renew()
                app.state.queue.poll_pending()
                app.state.stt.poll_pending()
                if summary_task is None or summary_task.done():
                    if summary_task is not None:
                        summary_task.result()
                    summary_task = asyncio.create_task(summaries.run_one(app))
                with suppress(asyncio.TimeoutError):
                    await asyncio.wait_for(stop.wait(), timeout=2)
            # Keep renewing ownership while already-started requests finish.
            # This bounded window fits the daemon's configured shutdown grace.
            deadline = loop.time() + min(190, config.model_timeout + 10)
            app.state.queue._closing = True
            while loop.time() < deadline:
                active = bool(app.state.queue._evaluations or app.state.stt.scheduled
                              or summary_task is not None and not summary_task.done())
                if not active:
                    break
                lease.renew()
                await asyncio.sleep(1)
    except LeaseLost:
        log.error('Background worker ownership was lost; stopping without replay')
        raise
    finally:
        if summary_task is not None and not summary_task.done():
            summary_task.cancel()
            await asyncio.gather(summary_task, return_exceptions=True)
        lease.release()


def main():
    logging.basicConfig(level=logging.INFO, format='%(levelname)s %(message)s')
    asyncio.run(serve())


if __name__ == '__main__':
    main()

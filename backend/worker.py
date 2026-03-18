from __future__ import annotations

import logging
import time

from app.config import get_settings
from app.database import SessionLocal, init_db
from app.ingestion.service import IngestionService
from app.reporting.service import ReportService
from app.scheduler import SchedulerService


logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
logger = logging.getLogger("worker")


def main() -> None:
    settings = get_settings()
    init_db()

    ingestion = IngestionService()
    ingestion.run_for_all_locations()

    scheduler = SchedulerService()
    scheduler.start()

    report_service = ReportService()

    logger.info("Worker started. Ingestion interval=%s minutes", settings.ingest_interval_minutes)
    try:
        while True:
            with SessionLocal() as db:
                processed = report_service.process_pending_jobs(db, max_jobs=4)
                if processed:
                    logger.info("Processed %s report jobs", processed)
            time.sleep(settings.report_worker_poll_seconds)
    except KeyboardInterrupt:
        logger.info("Worker interrupted, shutting down")
    finally:
        scheduler.stop()


if __name__ == "__main__":
    main()

from __future__ import annotations

from apscheduler.schedulers.background import BackgroundScheduler

from app.config import get_settings
from app.ingestion.service import IngestionService


class SchedulerService:
    def __init__(self) -> None:
        self.settings = get_settings()
        self.ingestion = IngestionService()
        self.scheduler = BackgroundScheduler(timezone="UTC")
        self._started = False

    def start(self) -> None:
        if self._started:
            return

        self.scheduler.add_job(
            self.ingestion.run_for_all_locations,
            "interval",
            minutes=self.settings.ingest_interval_minutes,
            id="ingest-all-locations",
            max_instances=1,
            replace_existing=True,
        )
        self.scheduler.start()
        self._started = True

    def stop(self) -> None:
        if not self._started:
            return
        self.scheduler.shutdown(wait=False)
        self._started = False

    def run_once(self) -> dict:
        return self.ingestion.run_for_all_locations()

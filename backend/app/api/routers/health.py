from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app import models
from app.database import get_db

router = APIRouter(tags=["health"])


@router.get("/health")
def health_check() -> dict:
    return {
        "status": "ok",
        "timestamp_utc": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/health/alerts")
def health_alerts(db: Session = Depends(get_db)) -> dict:
    now = datetime.now(timezone.utc)
    recent_failed_ingest = (
        db.query(models.IngestionRun)
        .filter(models.IngestionRun.started_at >= now.replace(minute=0, second=0, microsecond=0))
        .filter(models.IngestionRun.status == "failed")
        .count()
    )
    recent_fallbacks = (
        db.query(models.ModelDecision)
        .filter(models.ModelDecision.created_at >= now.replace(minute=0, second=0, microsecond=0))
        .filter(models.ModelDecision.fallback_used.is_(True))
        .count()
    )
    return {
        "generated_at": now.isoformat(),
        "alerts": [
            {
                "id": "ingest_failures_last_hour",
                "value": recent_failed_ingest,
                "status": "warn" if recent_failed_ingest > 0 else "ok",
            },
            {
                "id": "llm_fallbacks_last_hour",
                "value": recent_fallbacks,
                "status": "warn" if recent_fallbacks > 3 else "ok",
            },
        ],
    }

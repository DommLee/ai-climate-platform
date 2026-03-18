from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app import models
from app.database import get_db
from app.schemas import SourceDescriptor, SourcesResponse

router = APIRouter(tags=["sources"])


@router.get("/sources", response_model=SourcesResponse)
def get_sources(db: Session = Depends(get_db)) -> SourcesResponse:
    now = datetime.now(timezone.utc)

    def _freshness(source_id: str) -> int | None:
        obs_row = (
            db.query(models.Observation)
            .filter(models.Observation.source == source_id)
            .order_by(models.Observation.ts.desc())
            .first()
        )
        if obs_row:
            ts = obs_row.ts if obs_row.ts.tzinfo else obs_row.ts.replace(tzinfo=timezone.utc)
            return int((now - ts).total_seconds() // 60)

        event_row = (
            db.query(models.Event)
            .filter(models.Event.source == source_id)
            .order_by(models.Event.occurred_at.desc())
            .first()
        )
        if not event_row:
            return None
        ts = event_row.occurred_at if event_row.occurred_at.tzinfo else event_row.occurred_at.replace(tzinfo=timezone.utc)
        return int((now - ts).total_seconds() // 60)

    items = [
        SourceDescriptor(
            id="open_meteo",
            description=f"Realtime and short-term forecast weather data (freshness_min={_freshness('open_meteo')})",
            source_url="https://open-meteo.com/",
            license_tag="Open-Meteo terms",
            freshness_sla_minutes=30,
        ),
        SourceDescriptor(
            id="nasa_power",
            description=f"Historical climatology baseline (freshness_min={_freshness('nasa_power')})",
            source_url="https://power.larc.nasa.gov/docs/services/api/",
            license_tag="NASA POWER",
            freshness_sla_minutes=1440,
        ),
        SourceDescriptor(
            id="openaq",
            description=f"Air quality measurements (freshness_min={_freshness('openaq')})",
            source_url="https://docs.openaq.org/",
            license_tag="OpenAQ terms",
            freshness_sla_minutes=180,
        ),
        SourceDescriptor(
            id="reliefweb",
            description=f"Disaster events and humanitarian updates (freshness_min={_freshness('reliefweb')})",
            source_url="https://apidoc.reliefweb.int/",
            license_tag="ReliefWeb terms",
            freshness_sla_minutes=360,
        ),
        SourceDescriptor(
            id="gdelt",
            description=f"News signal stream for climate-related events (freshness_min={_freshness('gdelt')})",
            source_url="https://www.gdeltproject.org/",
            license_tag="GDELT terms",
            freshness_sla_minutes=180,
        ),
        SourceDescriptor(
            id="news_rss",
            description=f"RSS-based climate news fallback stream (freshness_min={_freshness('news_rss')})",
            source_url="https://news.google.com/",
            license_tag="Publisher terms via RSS links",
            freshness_sla_minutes=180,
        ),
        SourceDescriptor(
            id="emdat",
            description=f"Disaster dataset (licensed access, freshness_min={_freshness('emdat')})",
            source_url="https://doc.emdat.be/docs/data-accessibility/",
            license_tag="EM-DAT license",
            freshness_sla_minutes=10080,
        ),
        SourceDescriptor(
            id="copernicus_era5",
            description=f"Climate reanalysis baseline (CDS, freshness_min={_freshness('copernicus_era5')})",
            source_url="https://cds.climate.copernicus.eu/",
            license_tag="Copernicus terms",
            freshness_sla_minutes=1440,
        ),
    ]
    return SourcesResponse(generated_at=datetime.now(timezone.utc), items=items)

from datetime import datetime, timezone

from app import models
from app.connectors.base import ConnectorMetadata, ConnectorResult
from app.database import SessionLocal, init_db
from app.ingestion.service import IngestionService


def _connector(source, observations=None, events=None):
    return ConnectorResult(
        metadata=ConnectorMetadata(
            source=source,
            source_url=f"https://example.com/{source}",
            license_tag="test-license",
            freshness_sla_minutes=30,
        ),
        observations=observations or [],
        events=events or [],
        raw={},
    )


def test_ingestion_creates_risk_snapshot_and_features(monkeypatch):
    now = datetime.now(timezone.utc)

    monkeypatch.setattr(
        "app.ingestion.service.fetch_open_meteo",
        lambda lat, lon: _connector(
            "open_meteo",
            observations=[
                {"metric": "temperature_c", "value": 34.0, "unit": "C", "ts": now},
                {"metric": "humidity_pct", "value": 40.0, "unit": "%", "ts": now},
                {"metric": "wind_kmh", "value": 20.0, "unit": "km/h", "ts": now},
                {"metric": "precipitation_mm", "value": 0.5, "unit": "mm", "ts": now},
                {"metric": "pressure_hpa", "value": 1009.0, "unit": "hPa", "ts": now},
                {"metric": "forecast_precip_prob_pct", "value": 55.0, "unit": "%", "ts": now},
            ],
        ),
    )
    monkeypatch.setattr(
        "app.ingestion.service.fetch_nasa_power",
        lambda lat, lon: _connector(
            "nasa_power",
            observations=[
                {"metric": "historical_avg_temperature_c", "value": 28.0, "unit": "C", "ts": now},
                {"metric": "historical_avg_precip_mm_day", "value": 2.1, "unit": "mm/day", "ts": now},
            ],
        ),
    )
    monkeypatch.setattr(
        "app.ingestion.service.fetch_openaq",
        lambda lat, lon: _connector("openaq", observations=[{"metric": "pm25", "value": 45.0, "unit": "ug/m3", "ts": now}]),
    )
    monkeypatch.setattr(
        "app.ingestion.service.fetch_reliefweb_events",
        lambda location_name: _connector(
            "reliefweb",
            events=[
                {
                    "event_type": "disaster",
                    "severity": "high",
                    "title": "Flood warning",
                    "summary": "Heavy rain expected",
                    "occurred_at": now,
                    "source_url": "https://example.com/relief",
                }
            ],
        ),
    )
    monkeypatch.setattr("app.ingestion.service.fetch_gdelt_news", lambda location_name: _connector("gdelt"))
    monkeypatch.setattr("app.ingestion.service.fetch_news_rss", lambda location_name: _connector("news_rss"))
    monkeypatch.setattr("app.ingestion.service.fetch_emdat_events", lambda location_name: _connector("emdat"))
    monkeypatch.setattr("app.ingestion.service.fetch_copernicus_era5", lambda lat, lon: _connector("copernicus_era5"))

    init_db()
    service = IngestionService()
    result = service.run_for_location("istanbul")

    assert result["status"] == "ok"

    with SessionLocal() as db:
        risk = (
            db.query(models.RiskSnapshot)
            .filter(models.RiskSnapshot.location_id == "istanbul")
            .order_by(models.RiskSnapshot.generated_at.desc())
            .first()
        )
        assert risk is not None

        features = db.query(models.RiskFeature).filter(models.RiskFeature.risk_snapshot_id == risk.id).all()
        assert len(features) >= 5

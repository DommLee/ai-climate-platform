from datetime import datetime, timezone

from fastapi.testclient import TestClient

from app.connectors.base import ConnectorMetadata, ConnectorResult
from app.ingestion.service import IngestionService
from main import app


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


def test_api_snapshot_after_ingestion(monkeypatch):
    now = datetime.now(timezone.utc)

    monkeypatch.setattr(
        "app.ingestion.service.fetch_open_meteo",
        lambda lat, lon: _connector(
            "open_meteo",
            observations=[
                {"metric": "temperature_c", "value": 31.0, "unit": "C", "ts": now},
                {"metric": "humidity_pct", "value": 44.0, "unit": "%", "ts": now},
                {"metric": "wind_kmh", "value": 14.0, "unit": "km/h", "ts": now},
                {"metric": "precipitation_mm", "value": 0.2, "unit": "mm", "ts": now},
                {"metric": "pressure_hpa", "value": 1010.0, "unit": "hPa", "ts": now},
                {"metric": "forecast_precip_prob_pct", "value": 40.0, "unit": "%", "ts": now},
            ],
        ),
    )
    monkeypatch.setattr(
        "app.ingestion.service.fetch_nasa_power",
        lambda lat, lon: _connector("nasa_power", observations=[{"metric": "historical_avg_temperature_c", "value": 27.5, "unit": "C", "ts": now}]),
    )
    monkeypatch.setattr(
        "app.ingestion.service.fetch_openaq",
        lambda lat, lon: _connector("openaq", observations=[{"metric": "pm25", "value": 35.0, "unit": "ug/m3", "ts": now}]),
    )
    monkeypatch.setattr("app.ingestion.service.fetch_reliefweb_events", lambda location_name: _connector("reliefweb"))
    monkeypatch.setattr("app.ingestion.service.fetch_gdelt_news", lambda location_name: _connector("gdelt"))
    monkeypatch.setattr("app.ingestion.service.fetch_news_rss", lambda location_name: _connector("news_rss"))
    monkeypatch.setattr("app.ingestion.service.fetch_emdat_events", lambda location_name: _connector("emdat"))
    monkeypatch.setattr("app.ingestion.service.fetch_copernicus_era5", lambda lat, lon: _connector("copernicus_era5"))

    IngestionService().run_for_location("istanbul")

    client = TestClient(app, base_url="http://localhost")
    response = client.get("/api/v1/locations/istanbul/snapshot")
    assert response.status_code == 200
    body = response.json()
    assert body["location_id"] == "istanbul"
    assert "current_weather" in body
    assert body.get("source_attribution")
    assert "trust_score" in body["source_attribution"][0]

    events_res = client.get("/api/v1/locations/istanbul/events")
    assert events_res.status_code == 200
    assert "items" in events_res.json()

    ranking_res = client.get("/api/v1/locations/rankings?limit=5")
    assert ranking_res.status_code == 200
    ranking_body = ranking_res.json()
    assert ranking_body["items"]
    assert any(item["location_id"] == "istanbul" for item in ranking_body["items"])

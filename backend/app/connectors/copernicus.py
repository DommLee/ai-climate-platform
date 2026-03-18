from __future__ import annotations

from datetime import datetime, timezone

from app.config import get_settings
from app.connectors.base import ConnectorMetadata, ConnectorResult, http_get_json


def fetch_copernicus_era5(lat: float, lon: float) -> ConnectorResult:
    settings = get_settings()

    data = {"status": "fallback", "detail": "COPERNICUS_API_URL not configured"}
    observations = []

    if settings.copernicus_api_url:
        params = {
            "lat": lat,
            "lon": lon,
        }
        headers = {"Authorization": f"Bearer {settings.copernicus_api_key}"} if settings.copernicus_api_key else None
        response = http_get_json(settings.copernicus_api_url, params=params, headers=headers)
        if response:
            data = response
            anomaly = response.get("temperature_anomaly_c")
            if anomaly is not None:
                observations.append(
                    {
                        "metric": "copernicus_temperature_anomaly_c",
                        "value": float(anomaly),
                        "unit": "C",
                        "ts": datetime.now(timezone.utc),
                    }
                )

    return ConnectorResult(
        metadata=ConnectorMetadata(
            source="copernicus_era5",
            source_url="https://cds.climate.copernicus.eu/",
            license_tag="Copernicus CDS terms",
            freshness_sla_minutes=1440,
        ),
        observations=observations,
        events=[],
        raw=data,
    )

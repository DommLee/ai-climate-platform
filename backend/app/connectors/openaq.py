from __future__ import annotations

from datetime import datetime

from app.connectors.base import ConnectorMetadata, ConnectorResult, http_get_json, now_utc

OPENAQ_LATEST_URL = "https://api.openaq.org/v2/latest"


def fetch_openaq(lat: float, lon: float) -> ConnectorResult:
    params = {
        "coordinates": f"{lat},{lon}",
        "radius": 25000,
        "limit": 1,
    }
    data = http_get_json(OPENAQ_LATEST_URL, params=params, headers={}) or {}

    observations = []
    ts = now_utc()

    results = data.get("results", [])
    if results:
        measurements = results[0].get("measurements", [])
        for measurement in measurements:
            parameter = str(measurement.get("parameter", "")).lower()
            value = measurement.get("value")
            unit = str(measurement.get("unit", "")) or "ug/m3"
            if value is None:
                continue
            if parameter in {"pm25", "pm2.5"}:
                metric = "pm25"
            elif parameter == "pm10":
                metric = "pm10"
            elif parameter in {"o3", "no2", "so2", "co"}:
                metric = f"aq_{parameter}"
            else:
                continue

            last_updated = measurement.get("lastUpdated")
            if last_updated:
                try:
                    sample_ts = datetime.fromisoformat(last_updated.replace("Z", "+00:00"))
                except Exception:
                    sample_ts = ts
            else:
                sample_ts = ts

            observations.append(
                {
                    "metric": metric,
                    "value": float(value),
                    "unit": unit,
                    "ts": sample_ts,
                }
            )

    return ConnectorResult(
        metadata=ConnectorMetadata(
            source="openaq",
            source_url="https://docs.openaq.org/",
            license_tag="OpenAQ API terms",
            freshness_sla_minutes=180,
        ),
        observations=observations,
        events=[],
        raw=data,
    )

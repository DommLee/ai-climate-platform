from __future__ import annotations

from datetime import datetime, timezone

from app.connectors.base import ConnectorMetadata, ConnectorResult, http_get_json, now_utc

OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"


def fetch_open_meteo(lat: float, lon: float) -> ConnectorResult:
    params = {
        "latitude": lat,
        "longitude": lon,
        "current": "temperature_2m,relative_humidity_2m,wind_speed_10m,precipitation,surface_pressure",
        "hourly": "temperature_2m,precipitation_probability",
        "timezone": "auto",
    }

    data = http_get_json(OPEN_METEO_URL, params=params) or {}
    current = data.get("current", {})
    hourly = data.get("hourly", {})

    observations = []
    ts = now_utc()

    metric_map = {
        "temperature_2m": ("temperature_c", "C"),
        "relative_humidity_2m": ("humidity_pct", "%"),
        "wind_speed_10m": ("wind_kmh", "km/h"),
        "precipitation": ("precipitation_mm", "mm"),
        "surface_pressure": ("pressure_hpa", "hPa"),
    }

    for key, (metric, unit) in metric_map.items():
        value = current.get(key)
        if value is None:
            continue
        observations.append({"metric": metric, "value": float(value), "unit": unit, "ts": ts})

    hourly_times = hourly.get("time", [])
    hourly_temps = hourly.get("temperature_2m", [])
    hourly_precip_probs = hourly.get("precipitation_probability", [])

    for idx, timestamp in enumerate(hourly_times[:24]):
        try:
            sample_ts = datetime.fromisoformat(timestamp)
            if sample_ts.tzinfo is None:
                sample_ts = sample_ts.replace(tzinfo=timezone.utc)
        except Exception:
            sample_ts = ts

        if idx < len(hourly_temps):
            observations.append(
                {
                    "metric": "forecast_temperature_c",
                    "value": float(hourly_temps[idx]),
                    "unit": "C",
                    "ts": sample_ts,
                }
            )
        if idx < len(hourly_precip_probs):
            observations.append(
                {
                    "metric": "forecast_precip_prob_pct",
                    "value": float(hourly_precip_probs[idx]),
                    "unit": "%",
                    "ts": sample_ts,
                }
            )

    return ConnectorResult(
        metadata=ConnectorMetadata(
            source="open_meteo",
            source_url="https://open-meteo.com/",
            license_tag="Open-Meteo (non-commercial use requires terms review)",
            freshness_sla_minutes=30,
        ),
        observations=observations,
        events=[],
        raw=data,
    )

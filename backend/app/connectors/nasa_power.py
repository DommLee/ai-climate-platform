from __future__ import annotations

from app.connectors.base import ConnectorMetadata, ConnectorResult, http_get_json, now_utc

NASA_POWER_URL = "https://power.larc.nasa.gov/api/temporal/climatology/point"


def fetch_nasa_power(lat: float, lon: float) -> ConnectorResult:
    params = {
        "parameters": "T2M,PRECTOTCORR",
        "community": "RE",
        "latitude": lat,
        "longitude": lon,
        "format": "JSON",
    }
    data = http_get_json(NASA_POWER_URL, params=params) or {}
    parameter_data = data.get("properties", {}).get("parameter", {})

    t2m_map = parameter_data.get("T2M", {}) or {}
    precip_map = parameter_data.get("PRECTOTCORR", {}) or {}

    t2m_values = [float(v) for v in t2m_map.values() if v is not None]
    precip_values = [float(v) for v in precip_map.values() if v is not None]

    obs = []
    ts = now_utc()

    if t2m_values:
        obs.append(
            {
                "metric": "historical_avg_temperature_c",
                "value": sum(t2m_values) / len(t2m_values),
                "unit": "C",
                "ts": ts,
            }
        )
    if precip_values:
        obs.append(
            {
                "metric": "historical_avg_precip_mm_day",
                "value": sum(precip_values) / len(precip_values),
                "unit": "mm/day",
                "ts": ts,
            }
        )

    return ConnectorResult(
        metadata=ConnectorMetadata(
            source="nasa_power",
            source_url="https://power.larc.nasa.gov/docs/services/api/",
            license_tag="NASA POWER open data",
            freshness_sla_minutes=1440,
        ),
        observations=obs,
        events=[],
        raw=data,
    )

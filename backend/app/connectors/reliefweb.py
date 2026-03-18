from __future__ import annotations

from datetime import datetime, timezone
from typing import List

from app.config import get_settings
from app.connectors.base import ConnectorMetadata, ConnectorResult, http_get_json, now_utc

RELIEFWEB_URL = "https://api.reliefweb.int/v1/disasters"


def _parse_iso_datetime(value: str | None) -> datetime:
    if not value:
        return now_utc()
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except Exception:
        return now_utc()


def fetch_reliefweb_events(location_name: str) -> ConnectorResult:
    settings = get_settings()
    payload = {
        "appname": "ai-climate-platform",
        "limit": settings.max_event_records_per_source,
        "profile": "full",
        "query[value]": location_name,
        "sort[]": "date:desc",
    }
    data = http_get_json(RELIEFWEB_URL, params=payload) or {}

    events: List[dict] = []
    for item in data.get("data", []):
        fields = item.get("fields", {})
        title = fields.get("name") or "ReliefWeb disaster"
        summary = fields.get("description") or fields.get("status") or "Disaster signal"
        date_created = _parse_iso_datetime(fields.get("date", {}).get("created"))

        events.append(
            {
                "event_type": "disaster",
                "severity": "high" if "flood" in title.lower() or "wildfire" in title.lower() else "medium",
                "title": str(title)[:500],
                "summary": str(summary)[:4000],
                "occurred_at": date_created.astimezone(timezone.utc),
                "source_url": fields.get("url") or "https://reliefweb.int/",
            }
        )

    return ConnectorResult(
        metadata=ConnectorMetadata(
            source="reliefweb",
            source_url="https://apidoc.reliefweb.int/",
            license_tag="ReliefWeb API terms",
            freshness_sla_minutes=360,
        ),
        observations=[],
        events=events,
        raw=data,
    )

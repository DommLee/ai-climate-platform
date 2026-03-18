from __future__ import annotations

from datetime import datetime, timezone

from app.config import get_settings
from app.connectors.base import ConnectorMetadata, ConnectorResult, http_get_json


def fetch_emdat_events(location_name: str) -> ConnectorResult:
    settings = get_settings()

    events = []
    data = {"status": "fallback", "detail": "EMDAT_API_URL not configured"}

    if settings.emdat_api_url:
        params = {
            "query": location_name,
            "limit": settings.max_event_records_per_source,
        }
        headers = {"Authorization": f"Bearer {settings.emdat_api_key}"} if settings.emdat_api_key else None
        response = http_get_json(settings.emdat_api_url, params=params, headers=headers)
        if response:
            data = response
            records = response.get("items", []) if isinstance(response, dict) else []
            for item in records:
                title = str(item.get("title") or item.get("event") or "EM-DAT event")
                summary = str(item.get("summary") or item.get("description") or "Disaster event")
                occurred_raw = item.get("occurred_at") or item.get("date")
                try:
                    occurred_at = datetime.fromisoformat(str(occurred_raw).replace("Z", "+00:00"))
                    if occurred_at.tzinfo is None:
                        occurred_at = occurred_at.replace(tzinfo=timezone.utc)
                except Exception:
                    occurred_at = datetime.now(timezone.utc)

                events.append(
                    {
                        "event_type": "disaster",
                        "severity": str(item.get("severity", "medium")),
                        "title": title[:500],
                        "summary": summary[:3900],
                        "occurred_at": occurred_at,
                        "source_url": str(item.get("source_url") or settings.emdat_api_url),
                    }
                )

    return ConnectorResult(
        metadata=ConnectorMetadata(
            source="emdat",
            source_url="https://doc.emdat.be/docs/data-accessibility/",
            license_tag="EM-DAT licensed access",
            freshness_sla_minutes=10080,
        ),
        observations=[],
        events=events,
        raw=data,
    )

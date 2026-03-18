from __future__ import annotations

from datetime import datetime, timezone
from typing import List

from app.config import get_settings
from app.connectors.base import ConnectorMetadata, ConnectorResult, http_get_json, now_utc

GDELT_DOC_URL = "https://api.gdeltproject.org/api/v2/doc/doc"


def fetch_gdelt_news(location_name: str) -> ConnectorResult:
    settings = get_settings()
    query = f'"{location_name}" AND (climate OR heatwave OR flood OR drought OR wildfire)'

    params = {
        "query": query,
        "mode": "ArtList",
        "maxrecords": settings.max_event_records_per_source,
        "format": "json",
        "sort": "datedesc",
    }

    data = http_get_json(GDELT_DOC_URL, params=params) or {}
    events: List[dict] = []

    for article in data.get("articles", []):
        title = str(article.get("title") or "Climate signal article")
        source_url = str(article.get("url") or "https://www.gdeltproject.org/")
        summary = str(article.get("seendate") or "GDELT event signal")

        seen_date = article.get("seendate")
        occurred_at = now_utc()
        if isinstance(seen_date, str) and len(seen_date) >= 8:
            try:
                occurred_at = datetime.strptime(seen_date[:14], "%Y%m%d%H%M%S").replace(tzinfo=timezone.utc)
            except Exception:
                occurred_at = now_utc()

        events.append(
            {
                "event_type": "news_signal",
                "severity": "medium",
                "title": title[:500],
                "summary": summary[:4000],
                "occurred_at": occurred_at,
                "source_url": source_url[:500],
            }
        )

    return ConnectorResult(
        metadata=ConnectorMetadata(
            source="gdelt",
            source_url="https://www.gdeltproject.org/",
            license_tag="GDELT terms",
            freshness_sla_minutes=180,
        ),
        observations=[],
        events=events,
        raw=data,
    )

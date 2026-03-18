from __future__ import annotations

import html
import re
from datetime import timezone
from email.utils import parsedate_to_datetime
from typing import List
from urllib.parse import quote_plus
from xml.etree import ElementTree

import requests

from app.config import get_settings
from app.connectors.base import ConnectorMetadata, ConnectorResult, now_utc

HTML_TAG_RE = re.compile(r"<[^>]+>")


def _clean_html_text(value: str) -> str:
    plain = html.unescape(value or "")
    plain = HTML_TAG_RE.sub(" ", plain)
    plain = html.unescape(plain)
    return " ".join(plain.split())


def _severity_from_title(title: str) -> str:
    lowered = title.lower()
    if any(token in lowered for token in ["emergency", "deadly", "evacuation", "catastrophic"]):
        return "high"
    return "medium"


def fetch_news_rss(location_name: str) -> ConnectorResult:
    settings = get_settings()
    query = f'"{location_name}" (climate OR heatwave OR flood OR drought OR wildfire)'
    url = f"https://news.google.com/rss/search?q={quote_plus(query)}&hl=en-US&gl=US&ceid=US:en"

    events: List[dict] = []
    raw = {"status": "fallback", "detail": "rss_unavailable"}
    try:
        response = requests.get(
            url,
            headers={"User-Agent": f"{settings.app_name}/1.0"},
            timeout=settings.request_timeout_seconds,
        )
        if response.status_code < 400:
            raw = {"status": "ok", "length": len(response.text)}
            root = ElementTree.fromstring(response.text)
            items = root.findall(".//channel/item")
            for item in items[: settings.max_event_records_per_source]:
                title = _clean_html_text(item.findtext("title") or "Climate news signal")
                link = (item.findtext("link") or "https://news.google.com/").strip()
                summary = _clean_html_text(item.findtext("description") or "")
                if link and "news.google.com" not in link:
                    summary = f"{summary} (Original link: {link})"
                published_raw = item.findtext("pubDate")
                occurred_at = now_utc()
                if published_raw:
                    try:
                        occurred_at = parsedate_to_datetime(published_raw).astimezone(timezone.utc)
                    except Exception:
                        occurred_at = now_utc()

                events.append(
                    {
                        "event_type": "news_signal",
                        "severity": _severity_from_title(title),
                        "title": title[:500],
                        "summary": summary[:3900],
                        "occurred_at": occurred_at,
                        "source_url": "https://news.google.com/",
                    }
                )
    except Exception:
        pass

    return ConnectorResult(
        metadata=ConnectorMetadata(
            source="news_rss",
            source_url="https://news.google.com/",
            license_tag="Publisher terms via news RSS links",
            freshness_sla_minutes=180,
        ),
        observations=[],
        events=events,
        raw=raw,
    )

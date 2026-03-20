from __future__ import annotations

from datetime import datetime, timezone
import hashlib
import xml.etree.ElementTree as ET

import requests
from fastapi import APIRouter, Query

from app.config import get_settings
from app.schemas import OpportunitiesResponse, OpportunityItem

router = APIRouter(tags=["opportunities"])

OPPORTUNITY_FEEDS: list[tuple[str, str, str]] = [
    ("reliefweb", "ReliefWeb", "https://reliefweb.int/updates?search=climate%20funding&format=rss"),
    ("world_bank", "World Bank", "https://blogs.worldbank.org/rss/topics/climate-change"),
    ("undp", "UNDP", "https://www.undp.org/rss.xml"),
]


def _safe_text(node: ET.Element | None, tag: str, default: str = "") -> str:
    if node is None:
        return default
    found = node.find(tag)
    if found is None or found.text is None:
        return default
    return str(found.text).strip()


def _parse_rfc2822_to_iso(value: str) -> datetime | None:
    text = str(value or "").strip()
    if not text:
        return None
    try:
        from email.utils import parsedate_to_datetime

        parsed = parsedate_to_datetime(text)
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc)
    except Exception:
        return None


def _build_id(source: str, url: str, title: str) -> str:
    digest = hashlib.sha1(f"{source}|{url}|{title}".encode("utf-8")).hexdigest()[:14]
    return f"opp_{digest}"


def _fallback_items(lang: str) -> list[OpportunityItem]:
    if lang == "tr":
        rows = [
            (
                "Kurumsal Surdurulebilirlik Cagri Takibi",
                "Platform",
                "Canli RSS/API kaynagi gecici olarak kullanilamadi. Bu alan fallback modda bilgilendirici olarak gosteriliyor.",
                "https://reliefweb.int/",
                "reliefweb",
                ["surdurulebilirlik", "hibe", "cagri"],
            ),
            (
                "Iklim Uyum Programlarini Izle",
                "Platform",
                "UNDP ve World Bank akislari saglikli oldugunda son basvuru tarihleri ve resmi baglantilar burada listelenir.",
                "https://www.worldbank.org/en/topic/climatechange",
                "world_bank",
                ["iklim", "adaptasyon", "program"],
            ),
        ]
    else:
        rows = [
            (
                "Sustainability Opportunity Tracker",
                "Platform",
                "Live RSS/API opportunity feeds are temporarily unavailable. This placeholder remains visible in fallback mode.",
                "https://reliefweb.int/",
                "reliefweb",
                ["sustainability", "grant", "call"],
            ),
            (
                "Monitor Climate Adaptation Calls",
                "Platform",
                "When live UNDP and World Bank feeds are available, deadlines and official links will be listed here.",
                "https://www.worldbank.org/en/topic/climatechange",
                "world_bank",
                ["climate", "adaptation", "program"],
            ),
        ]
    now = datetime.now(timezone.utc)
    return [
        OpportunityItem(
            id=_build_id(source, url, title),
            title=title,
            organization=org,
            summary=summary,
            source_url=url,
            source=source,
            published_at=now,
            tags=tags,
        )
        for title, org, summary, url, source, tags in rows
    ]


@router.get("/opportunities", response_model=OpportunitiesResponse)
def get_opportunities(
    lang: str = Query("tr", pattern="^(tr|en)$"),
    limit: int = Query(12, ge=1, le=40),
) -> OpportunitiesResponse:
    settings = get_settings()
    items: list[OpportunityItem] = []

    for source, org, url in OPPORTUNITY_FEEDS:
        try:
            response = requests.get(
                url,
                timeout=settings.request_timeout_seconds,
                headers={"User-Agent": f"{settings.app_name}/1.0", "Accept": "application/rss+xml,application/xml,text/xml"},
            )
            if response.status_code >= 400:
                continue
            root = ET.fromstring(response.content)
            rss_items = root.findall(".//item")
            for node in rss_items[: min(12, limit)]:
                title = _safe_text(node, "title")
                link = _safe_text(node, "link")
                description = _safe_text(node, "description")
                if not title or not link:
                    continue
                published = _parse_rfc2822_to_iso(_safe_text(node, "pubDate"))
                summary = description.strip().replace("\n", " ")
                if len(summary) > 420:
                    summary = f"{summary[:417]}..."
                items.append(
                    OpportunityItem(
                        id=_build_id(source, link, title),
                        title=title,
                        organization=org,
                        summary=summary,
                        source_url=link,
                        source=source,
                        published_at=published,
                        tags=["climate", "sustainability", "funding"],
                    )
                )
        except Exception:
            continue

    if not items:
        items = _fallback_items(lang)

    dedup: dict[str, OpportunityItem] = {}
    for item in items:
        if item.id not in dedup:
            dedup[item.id] = item

    sorted_items = sorted(
        dedup.values(),
        key=lambda row: row.published_at or datetime(1970, 1, 1, tzinfo=timezone.utc),
        reverse=True,
    )
    return OpportunitiesResponse(generated_at=datetime.now(timezone.utc), items=sorted_items[:limit])

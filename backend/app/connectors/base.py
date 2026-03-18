from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
import time
from typing import Any, Dict, List

import requests

from app.config import get_settings


@dataclass
class ConnectorMetadata:
    source: str
    source_url: str
    license_tag: str
    freshness_sla_minutes: int


@dataclass
class ConnectorResult:
    metadata: ConnectorMetadata
    observations: List[Dict[str, Any]]
    events: List[Dict[str, Any]]
    raw: Dict[str, Any]


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def http_get_json(url: str, params: Dict[str, Any] | None = None, headers: Dict[str, str] | None = None) -> Dict[str, Any] | None:
    settings = get_settings()
    request_headers = {
        "User-Agent": f"{settings.app_name}/1.0",
        "Accept": "application/json",
    }
    if headers:
        request_headers.update(headers)

    for attempt in range(2):
        response = requests.get(url, params=params, headers=request_headers, timeout=settings.request_timeout_seconds)
        if response.status_code == 429 and attempt == 0:
            time.sleep(1.0)
            continue
        if response.status_code >= 400:
            return None
        try:
            return response.json()
        except Exception:
            return None
    return None

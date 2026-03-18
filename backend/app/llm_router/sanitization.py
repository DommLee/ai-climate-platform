from __future__ import annotations

import re
from urllib.parse import urlparse


def strip_control_chars(value: str) -> str:
    return "".join(ch for ch in value if ch.isprintable())


def truncate_text(value: str, max_chars: int) -> str:
    if len(value) <= max_chars:
        return value
    return value[: max_chars - 3] + "..."


def is_domain_allowlisted(url: str, allowlist_domains: list[str]) -> bool:
    try:
        host = urlparse(url).hostname or ""
    except Exception:
        return False

    for item in allowlist_domains:
        if host == item or host.endswith("." + item):
            return True
    return False


def sanitize_evidence(evidence: list[dict], allowlist_domains: list[str], max_chars: int) -> list[dict]:
    sanitized = []
    for item in evidence:
        url = str(item.get("source_url", "")).strip()
        if url and not is_domain_allowlisted(url, allowlist_domains):
            continue

        title = strip_control_chars(str(item.get("title", "")))
        summary = strip_control_chars(str(item.get("summary", "")))

        sanitized.append(
            {
                "source": strip_control_chars(str(item.get("source", "unknown")))[:120],
                "source_url": url[:500],
                "title": truncate_text(title, 300),
                "summary": truncate_text(summary, max_chars),
                "timestamp_utc": str(item.get("timestamp_utc", "")),
            }
        )
    return sanitized


def extract_json_blob(text: str) -> str:
    fenced = re.findall(r"```json\s*(\{.*?\})\s*```", text, flags=re.DOTALL)
    if fenced:
        return fenced[0]
    trimmed = text.strip()
    start = trimmed.find("{")
    end = trimmed.rfind("}")
    if start >= 0 and end > start:
        return trimmed[start : end + 1]
    return trimmed

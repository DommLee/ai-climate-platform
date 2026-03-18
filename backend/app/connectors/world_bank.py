from __future__ import annotations

import csv
from concurrent.futures import ThreadPoolExecutor
import io
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Tuple

import requests

from app.config import get_settings
from app.connectors.base import ConnectorMetadata, http_get_json

WORLD_BANK_BASE_URL = "https://api.worldbank.org/v2/country"
WORLD_BANK_CACHE_TTL_HOURS = 12
WORLD_BANK_CACHE: Dict[str, tuple[datetime, List[dict]]] = {}

OWID_CO2_CSV_URL = "https://ourworldindata.org/grapher/co-emissions-per-capita.csv"
OWID_CO2_CACHE_TTL_HOURS = 24
OWID_CO2_CACHE: tuple[datetime, Dict[str, tuple[float, int]]] | None = None

WORLD_BANK_INDICATORS = {
    "EN.ATM.CO2E.PC": {
        "label": "CO2 emissions per capita",
        "unit": "t CO2/person",
    },
    "EG.FEC.RNEW.ZS": {
        "label": "Renewable energy consumption share",
        "unit": "%",
    },
    "AG.LND.FRST.ZS": {
        "label": "Forest area share",
        "unit": "%",
    },
    "EN.POP.DNST": {
        "label": "Population density",
        "unit": "people/km2",
    },
    "NY.GDP.PCAP.CD": {
        "label": "GDP per capita",
        "unit": "USD",
    },
    "EG.ELC.ACCS.ZS": {
        "label": "Access to electricity",
        "unit": "%",
    },
}


def _extract_latest_value(payload: dict | list | None) -> tuple[float | None, int | None]:
    if not isinstance(payload, list) or len(payload) < 2 or not isinstance(payload[1], list):
        return None, None
    for row in payload[1]:
        if not isinstance(row, dict):
            continue
        value = row.get("value")
        if value is None:
            continue
        try:
            numeric_value = float(value)
        except Exception:
            continue
        date_raw = str(row.get("date", "")).strip()
        year = int(date_raw) if date_raw.isdigit() else None
        return numeric_value, year
    return None, None


def _fetch_indicator(country_code: str, indicator_id: str) -> tuple[float | None, int | None]:
    try:
        payload = http_get_json(
            f"{WORLD_BANK_BASE_URL}/{country_code}/indicator/{indicator_id}",
            params={"format": "json", "per_page": 100},
        )
    except Exception:
        return None, None
    return _extract_latest_value(payload)


def _load_owid_co2_points() -> Dict[str, tuple[float, int]]:
    global OWID_CO2_CACHE
    now = datetime.now(timezone.utc)
    if OWID_CO2_CACHE and OWID_CO2_CACHE[0] > now:
        return OWID_CO2_CACHE[1]

    settings = get_settings()
    points: Dict[str, tuple[float, int]] = {}
    try:
        response = requests.get(
            OWID_CO2_CSV_URL,
            timeout=settings.request_timeout_seconds,
            headers={"User-Agent": f"{settings.app_name}/1.0"},
        )
        if response.status_code >= 400:
            OWID_CO2_CACHE = (now + timedelta(hours=2), {})
            return {}

        reader = csv.DictReader(io.StringIO(response.text))
        value_key = reader.fieldnames[-1] if reader.fieldnames else None
        if not value_key:
            OWID_CO2_CACHE = (now + timedelta(hours=2), {})
            return {}

        for row in reader:
            code = str(row.get("Code", "")).strip().upper()
            year_raw = str(row.get("Year", "")).strip()
            value_raw = str(row.get(value_key, "")).strip()
            if not code or not year_raw or not value_raw:
                continue
            try:
                year = int(year_raw)
                value = float(value_raw)
            except Exception:
                continue
            existing = points.get(code)
            if not existing or year > existing[1]:
                points[code] = (value, year)
    except Exception:
        points = {}

    OWID_CO2_CACHE = (now + timedelta(hours=OWID_CO2_CACHE_TTL_HOURS), points)
    return points


def _fallback_co2_from_owid(country_code: str) -> tuple[float | None, int | None, float | None, int | None]:
    points = _load_owid_co2_points()
    country = points.get(country_code.strip().upper())
    world = points.get("OWID_WRL")
    return (
        country[0] if country else None,
        country[1] if country else None,
        world[0] if world else None,
        world[1] if world else None,
    )


def fetch_world_bank_metrics(country_code: str) -> Tuple[ConnectorMetadata, List[dict]]:
    key = str(country_code or "").strip().upper()
    if not key:
        return (
            ConnectorMetadata(
                source="world_bank",
                source_url="https://datahelpdesk.worldbank.org/knowledgebase/topics/125589",
                license_tag="World Bank Data API terms",
                freshness_sla_minutes=10080,
            ),
            [],
        )

    now = datetime.now(timezone.utc)
    cached = WORLD_BANK_CACHE.get(key)
    if cached and cached[0] > now:
        return (
            ConnectorMetadata(
                source="world_bank",
                source_url="https://datahelpdesk.worldbank.org/knowledgebase/topics/125589",
                license_tag="World Bank Data API terms",
                freshness_sla_minutes=10080,
            ),
            cached[1],
        )

    indicator_pairs = []
    for indicator_id in WORLD_BANK_INDICATORS:
        indicator_pairs.append((key, indicator_id))
        indicator_pairs.append(("WLD", indicator_id))

    fetched_values: Dict[tuple[str, str], tuple[float | None, int | None]] = {}
    max_workers = min(12, max(2, len(indicator_pairs)))
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {executor.submit(_fetch_indicator, ccode, indicator): (ccode, indicator) for ccode, indicator in indicator_pairs}
        for future, pair in ((fut, identity) for fut, identity in futures.items()):
            try:
                fetched_values[pair] = future.result()
            except Exception:
                fetched_values[pair] = (None, None)

    metrics: List[dict] = []
    for indicator_id, descriptor in WORLD_BANK_INDICATORS.items():
        value, year = fetched_values.get((key, indicator_id), (None, None))
        benchmark_value, benchmark_year = fetched_values.get(("WLD", indicator_id), (None, None))
        source = "world_bank"

        if indicator_id == "EN.ATM.CO2E.PC" and (value is None or benchmark_value is None):
            co2_value, co2_year, co2_world_value, co2_world_year = _fallback_co2_from_owid(key)
            if co2_value is not None:
                value, year = co2_value, co2_year
                source = "owid"
            if co2_world_value is not None:
                benchmark_value, benchmark_year = co2_world_value, co2_world_year
                source = "owid"

        delta_pct = None
        if value is not None and benchmark_value not in (None, 0):
            delta_pct = round(((value - benchmark_value) / abs(benchmark_value)) * 100.0, 1)

        metrics.append(
            {
                "indicator_id": indicator_id,
                "label": descriptor["label"],
                "unit": descriptor["unit"],
                "value": round(value, 3) if value is not None else None,
                "year": year,
                "benchmark_value": round(benchmark_value, 3) if benchmark_value is not None else None,
                "benchmark_year": benchmark_year,
                "benchmark_label": "World",
                "delta_pct_vs_benchmark": delta_pct,
                "source": source,
            }
        )

    WORLD_BANK_CACHE[key] = (now + timedelta(hours=WORLD_BANK_CACHE_TTL_HOURS), metrics)

    metadata = ConnectorMetadata(
        source="world_bank",
        source_url="https://datahelpdesk.worldbank.org/knowledgebase/topics/125589",
        license_tag="World Bank Data API terms",
        freshness_sla_minutes=10080,
    )
    return metadata, metrics

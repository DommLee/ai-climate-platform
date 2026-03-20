#!/usr/bin/env python3
from __future__ import annotations

import argparse
import sys
from typing import Any

import requests


def ensure(condition: bool, message: str) -> None:
    if not condition:
        raise RuntimeError(message)


def get_json(session: requests.Session, base_url: str, path: str, timeout: int) -> Any:
    response = session.get(f"{base_url}{path}", timeout=timeout)
    ensure(response.status_code < 400, f"{path} failed with HTTP {response.status_code}: {response.text[:220]}")
    try:
        return response.json()
    except Exception as exc:
        raise RuntimeError(f"{path} returned non-JSON response") from exc


def main() -> int:
    parser = argparse.ArgumentParser(description="Smoke test for AI Climate API endpoints.")
    parser.add_argument("--base-url", required=True, help="API base url, e.g. https://api.example.com")
    parser.add_argument("--timeout", type=int, default=25, help="HTTP timeout in seconds")
    args = parser.parse_args()

    base_url = args.base_url.rstrip("/")
    timeout = args.timeout
    session = requests.Session()

    try:
        health = get_json(session, base_url, "/api/v1/health", timeout)
        ensure(str(health.get("status", "")).lower() == "ok", "/api/v1/health status is not ok")

        system = get_json(session, base_url, "/api/v1/system/status", timeout)
        mode = str(system.get("mode", ""))
        ensure(mode in {"LIVE", "LIVE_WITH_FALLBACK", "DEMO"}, f"Unexpected system mode: {mode}")

        countries = get_json(session, base_url, "/api/v1/countries", timeout)
        items = countries.get("items") if isinstance(countries, dict) else None
        ensure(isinstance(items, list) and len(items) > 0, "/api/v1/countries returned empty list")

        tur_cities = get_json(session, base_url, "/api/v1/countries/TUR/cities", timeout)
        city_items = tur_cities.get("items") if isinstance(tur_cities, dict) else None
        ensure(isinstance(city_items, list), "/api/v1/countries/TUR/cities items is not a list")

        tur_profile = get_json(session, base_url, "/api/v1/countries/TUR/profile?lang=en&days=90", timeout)
        ensure(str(tur_profile.get("iso3", "")).upper() == "TUR", "Country profile ISO mismatch for TUR")
        ensure("signal_summary" in tur_profile, "Country profile missing signal_summary")

        locations = get_json(session, base_url, "/api/v1/locations", timeout)
        ensure(isinstance(locations, list) and len(locations) > 0, "/api/v1/locations returned empty list")
        first_location_id = str(locations[0].get("id", "")).strip()
        ensure(bool(first_location_id), "First location has no id")

        snapshot = get_json(session, base_url, f"/api/v1/locations/{first_location_id}/snapshot", timeout)
        ensure("risk" in snapshot and "current_weather" in snapshot, "Snapshot missing core fields")

        print("Smoke API checks passed")
        return 0
    except Exception as exc:
        print(f"Smoke API checks failed: {exc}")
        return 1


if __name__ == "__main__":
    sys.exit(main())

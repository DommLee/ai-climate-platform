from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient

from app.connectors.base import ConnectorMetadata, ConnectorResult
from main import app


def _connector(source, events=None):
    return ConnectorResult(
        metadata=ConnectorMetadata(
            source=source,
            source_url=f"https://example.com/{source}",
            license_tag="test-license",
            freshness_sla_minutes=30,
        ),
        observations=[],
        events=events or [],
        raw={},
    )


def test_country_profile_endpoint(monkeypatch):
    now = datetime.now(timezone.utc)

    monkeypatch.setattr(
        "app.api.routers.countries._extract_country_meta",
        lambda code: {
            "country_name": "Turkey",
            "iso2": "TR",
            "iso3": "TUR",
            "region": "Europe",
            "capital": "Ankara",
            "population": 86000000,
            "area_km2": 783562.0,
            "lat": 39.0,
            "lon": 35.0,
        },
    )
    monkeypatch.setattr(
        "app.api.routers.countries.fetch_reliefweb_events",
        lambda name: _connector(
            "reliefweb",
            events=[
                {
                    "event_type": "disaster",
                    "severity": "high",
                    "title": "Flood warning",
                    "summary": "Heavy rain risk",
                    "occurred_at": now - timedelta(days=2),
                    "source_url": "https://example.com/relief-1",
                }
            ],
        ),
    )
    monkeypatch.setattr(
        "app.api.routers.countries.fetch_gdelt_news",
        lambda name: _connector(
            "gdelt",
            events=[
                {
                    "event_type": "news_signal",
                    "severity": "medium",
                    "title": "Heatwave pressure on water",
                    "summary": "Recent climate signal",
                    "occurred_at": now - timedelta(days=1),
                    "source_url": "https://example.com/gdelt-1",
                },
                {
                    "event_type": "news_signal",
                    "severity": "medium",
                    "title": "Football match result",
                    "summary": "Local league update",
                    "occurred_at": now - timedelta(days=1),
                    "source_url": "https://example.com/gdelt-2",
                },
            ],
        ),
    )
    monkeypatch.setattr(
        "app.api.routers.countries.fetch_news_rss",
        lambda name: _connector(
            "news_rss",
            events=[
                {
                    "event_type": "news_signal",
                    "severity": "medium",
                    "title": "Climate adaptation policy update",
                    "summary": "Policy and resilience signal",
                    "occurred_at": now - timedelta(days=1),
                    "source_url": "https://news.google.com/",
                }
            ],
        ),
    )
    monkeypatch.setattr("app.api.routers.countries.fetch_emdat_events", lambda name: _connector("emdat", events=[]))
    monkeypatch.setattr(
        "app.api.routers.countries.fetch_world_bank_metrics",
        lambda country_code: (
            ConnectorMetadata(
                source="world_bank",
                source_url="https://api.worldbank.org/",
                license_tag="World Bank Data API terms",
                freshness_sla_minutes=10080,
            ),
            [
                {
                    "indicator_id": "EN.ATM.CO2E.PC",
                    "label": "CO2 emissions per capita",
                    "unit": "t CO2/person",
                    "value": 4.8,
                    "year": 2023,
                    "benchmark_value": 4.2,
                    "benchmark_year": 2023,
                    "benchmark_label": "World",
                    "delta_pct_vs_benchmark": 14.3,
                    "source": "world_bank",
                },
                {
                    "indicator_id": "EG.FEC.RNEW.ZS",
                    "label": "Renewable energy consumption share",
                    "unit": "%",
                    "value": 16.1,
                    "year": 2023,
                    "benchmark_value": 18.4,
                    "benchmark_year": 2023,
                    "benchmark_label": "World",
                    "delta_pct_vs_benchmark": -12.5,
                    "source": "world_bank",
                },
            ],
        ),
    )

    client = TestClient(app, base_url="http://localhost")
    response = client.get("/api/v1/countries/TUR/profile?lang=tr&days=90")
    assert response.status_code == 200
    body = response.json()
    assert body["iso3"] == "TUR"
    assert body["signal_summary"]["total_signals"] == 3
    assert body["insight"]["content"]["summary"]
    assert body["recent_signals"]
    assert body["historical_summary"]["lookback_days"] == 90
    assert body["historical_summary"]["timeline"]
    assert body["historical_summary"]["trend_direction"] in {"rising", "falling", "stable"}
    assert body["macro_metrics"]
    assert body["resilience_scorecard"]["overall_resilience_score"] >= 0
    assert body["narrative"]["executive_brief"]


def test_country_profile_filters_ambiguous_turkey_news(monkeypatch):
    now = datetime.now(timezone.utc)

    monkeypatch.setattr(
        "app.api.routers.countries._extract_country_meta",
        lambda code: {
            "country_name": "Turkey",
            "iso2": "TR",
            "iso3": "TUR",
            "region": "Europe",
            "capital": "Ankara",
            "population": 86000000,
            "area_km2": 783562.0,
            "lat": 39.0,
            "lon": 35.0,
        },
    )
    monkeypatch.setattr("app.api.routers.countries.fetch_reliefweb_events", lambda name: _connector("reliefweb", events=[]))
    monkeypatch.setattr("app.api.routers.countries.fetch_gdelt_news", lambda name: _connector("gdelt", events=[]))
    monkeypatch.setattr(
        "app.api.routers.countries.fetch_news_rss",
        lambda name: _connector(
            "news_rss",
            events=[
                {
                    "event_type": "news_signal",
                    "severity": "medium",
                    "title": "Turkey Gully flood mitigation project update",
                    "summary": "Houston urban flood mitigation project",
                    "occurred_at": now - timedelta(days=1),
                    "source_url": "https://news.google.com/",
                },
                {
                    "event_type": "news_signal",
                    "severity": "medium",
                    "title": "Climate policy transition in Turkey energy sector",
                    "summary": "Ankara and Istanbul industrial adaptation plan",
                    "occurred_at": now - timedelta(days=1),
                    "source_url": "https://news.google.com/",
                },
            ],
        ),
    )
    monkeypatch.setattr("app.api.routers.countries.fetch_emdat_events", lambda name: _connector("emdat", events=[]))
    monkeypatch.setattr(
        "app.api.routers.countries.fetch_world_bank_metrics",
        lambda country_code: (
            ConnectorMetadata(
                source="world_bank",
                source_url="https://api.worldbank.org/",
                license_tag="World Bank Data API terms",
                freshness_sla_minutes=10080,
            ),
            [],
        ),
    )

    client = TestClient(app, base_url="http://localhost")
    response = client.get("/api/v1/countries/TUR/profile?lang=en&days=90")
    assert response.status_code == 200
    body = response.json()
    titles = [item["title"] for item in body["recent_signals"]]
    assert any("Climate policy transition in Turkey" in title for title in titles)
    assert not any("Turkey Gully" in title for title in titles)

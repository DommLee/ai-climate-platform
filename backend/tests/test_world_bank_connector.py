from app.connectors import world_bank
from app.connectors.world_bank import fetch_world_bank_metrics


def test_world_bank_connector_parses_metrics(monkeypatch):
    world_bank.WORLD_BANK_CACHE.clear()
    world_bank.OWID_CO2_CACHE = None

    def fake_get_json(url, params=None, headers=None):
        if "country/WLD/indicator/" in url:
            return [
                {"page": 1},
                [
                    {
                        "date": "2023",
                        "value": 10.0,
                    }
                ],
            ]
        return [
            {"page": 1},
            [
                {
                    "date": "2023",
                    "value": 12.5,
                }
            ],
        ]

    monkeypatch.setattr("app.connectors.world_bank.http_get_json", fake_get_json)
    metadata, metrics = fetch_world_bank_metrics("TUR")

    assert metadata.source == "world_bank"
    assert metrics
    assert any(item["indicator_id"] == "EN.ATM.CO2E.PC" for item in metrics)
    co2_metric = next(item for item in metrics if item["indicator_id"] == "EN.ATM.CO2E.PC")
    assert co2_metric["value"] == 12.5
    assert co2_metric["benchmark_value"] == 10.0
    assert co2_metric["delta_pct_vs_benchmark"] == 25.0


def test_world_bank_connector_falls_back_to_owid_for_co2(monkeypatch):
    world_bank.WORLD_BANK_CACHE.clear()
    world_bank.OWID_CO2_CACHE = None

    def fake_get_json(url, params=None, headers=None):
        if "EN.ATM.CO2E.PC" in url:
            return [{"page": 1}, [{"date": "2024", "value": None}]]
        return [{"page": 1}, [{"date": "2024", "value": 10.0}]]

    class _MockResponse:
        def __init__(self, status_code: int, text: str) -> None:
            self.status_code = status_code
            self.text = text

    csv_text = "\n".join(
        [
            "Entity,Code,Year,CO2 emissions per capita",
            "Turkey,TUR,2024,5.8",
            "World,OWID_WRL,2024,4.7",
        ]
    )

    monkeypatch.setattr("app.connectors.world_bank.http_get_json", fake_get_json)
    monkeypatch.setattr("app.connectors.world_bank.requests.get", lambda *args, **kwargs: _MockResponse(200, csv_text))

    _, metrics = fetch_world_bank_metrics("TUR")
    co2_metric = next(item for item in metrics if item["indicator_id"] == "EN.ATM.CO2E.PC")

    assert co2_metric["source"] == "owid"
    assert co2_metric["value"] == 5.8
    assert co2_metric["benchmark_value"] == 4.7

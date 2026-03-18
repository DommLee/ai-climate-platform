from app.connectors.open_meteo import fetch_open_meteo


def test_open_meteo_connector_parses_observations(monkeypatch):
    def fake_get_json(url, params=None, headers=None):
        return {
            "current": {
                "temperature_2m": 29.1,
                "relative_humidity_2m": 52,
                "wind_speed_10m": 15.3,
                "precipitation": 1.2,
                "surface_pressure": 1008,
            },
            "hourly": {
                "time": ["2026-03-17T00:00", "2026-03-17T01:00"],
                "temperature_2m": [28.1, 27.9],
                "precipitation_probability": [35, 42],
            },
        }

    monkeypatch.setattr("app.connectors.open_meteo.http_get_json", fake_get_json)

    result = fetch_open_meteo(41.0, 29.0)
    metric_names = {item["metric"] for item in result.observations}

    assert "temperature_c" in metric_names
    assert "humidity_pct" in metric_names
    assert "forecast_temperature_c" in metric_names
    assert result.metadata.source == "open_meteo"

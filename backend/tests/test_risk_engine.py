from app.risk_engine.scoring import calculate_risk


def test_risk_score_in_expected_range() -> None:
    payload = calculate_risk(
        features={
            "temperature_c": 37,
            "temp_anomaly_c": 2.1,
            "precip_prob": 65,
            "wind_kmh": 28,
            "pm25": 56,
            "recent_event_count": 4,
        },
        exposure=0.70,
        vulnerability=0.52,
        data_completeness=0.88,
    )

    assert 0 <= payload["overall"] <= 100
    assert 0 <= payload["uncertainty_low"] <= 100
    assert 0 <= payload["uncertainty_high"] <= 100
    assert payload["primary_threat"] in {"heatwave", "flood", "drought", "air_quality"}

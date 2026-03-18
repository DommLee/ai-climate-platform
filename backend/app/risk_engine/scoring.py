from __future__ import annotations

import math
from typing import Dict


def _clamp(value: float, min_value: float = 0.0, max_value: float = 1.0) -> float:
    return max(min_value, min(max_value, value))


def _norm(value: float, low: float, high: float) -> float:
    if high <= low:
        return 0.0
    return _clamp((value - low) / (high - low))


def _sigmoid(x: float) -> float:
    return 1.0 / (1.0 + math.exp(-x))


def calculate_risk(features: Dict[str, float], exposure: float, vulnerability: float, data_completeness: float) -> Dict[str, float]:
    temp = features.get("temperature_c", 25.0)
    anomaly = features.get("temp_anomaly_c", 0.0)
    precip_prob = features.get("precip_prob", 25.0)
    wind = features.get("wind_kmh", 10.0)
    pm25 = features.get("pm25", 20.0)
    recent_events = features.get("recent_event_count", 0.0)

    heat_hazard = (0.65 * _norm(temp, 24, 45)) + (0.35 * _norm(anomaly, 0, 4))
    flood_hazard = (0.60 * _norm(precip_prob, 15, 100)) + (0.40 * _norm(recent_events, 0, 10))
    drought_hazard = (0.55 * _norm(anomaly, 0, 4)) + (0.45 * (1 - _norm(precip_prob, 10, 80)))
    air_hazard = (0.70 * _norm(pm25, 12, 180)) + (0.30 * _norm(wind, 8, 70))

    hazard_components = {
        "heatwave": _clamp(heat_hazard),
        "flood": _clamp(flood_hazard),
        "drought": _clamp(drought_hazard),
        "air_quality": _clamp(air_hazard),
    }

    primary_threat = max(hazard_components, key=hazard_components.get)
    hazard = float(sum(hazard_components.values()) / len(hazard_components))

    exposure_score = _clamp(exposure)
    vulnerability_score = _clamp(vulnerability)

    overall = _clamp((0.50 * hazard) + (0.30 * exposure_score) + (0.20 * vulnerability_score))

    model_signal = (2.2 * hazard) + (1.4 * exposure_score) + (1.0 * vulnerability_score) - 1.6
    probability_30d = _clamp(_sigmoid(model_signal))

    confidence = _clamp((0.45 * data_completeness) + 0.45)
    uncertainty = _clamp((1 - data_completeness) * 0.35 + 0.07, 0.05, 0.40)

    overall_100 = round(overall * 100, 2)
    return {
        "hazard": round(hazard * 100, 2),
        "exposure": round(exposure_score * 100, 2),
        "vulnerability": round(vulnerability_score * 100, 2),
        "overall": overall_100,
        "probability_30d": round(probability_30d * 100, 2),
        "confidence": round(confidence * 100, 2),
        "uncertainty_low": round(max(0.0, overall_100 - (uncertainty * 100)), 2),
        "uncertainty_high": round(min(100.0, overall_100 + (uncertainty * 100)), 2),
        "primary_threat": primary_threat,
        "hazard_components": {k: round(v * 100, 2) for k, v in hazard_components.items()},
    }

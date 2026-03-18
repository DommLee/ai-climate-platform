from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Dict, List

from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app import models
from app.config import get_settings
from app.connectors import (
    fetch_copernicus_era5,
    fetch_emdat_events,
    fetch_gdelt_news,
    fetch_nasa_power,
    fetch_news_rss,
    fetch_open_meteo,
    fetch_openaq,
    fetch_reliefweb_events,
)
from app.connectors.base import ConnectorResult
from app.database import SessionLocal
from app.locations import get_location, list_locations
from app.observability import INGEST_RUN_COUNT
from app.risk_engine import calculate_risk

logger = logging.getLogger(__name__)


class IngestionService:
    SOURCE_TRUST = {
        "open_meteo": 0.92,
        "nasa_power": 0.95,
        "copernicus_era5": 0.95,
        "openaq": 0.90,
        "reliefweb": 0.85,
        "gdelt": 0.74,
        "news_rss": 0.68,
        "emdat": 0.90,
    }
    CLIMATE_SIGNAL_KEYWORDS = (
        "climate",
        "heatwave",
        "flood",
        "drought",
        "wildfire",
        "storm",
        "hurricane",
        "cyclone",
        "sea level",
        "air quality",
        "pm2.5",
        "emission",
        "decarbon",
        "renewable",
        "sustainability",
        "temperature anomaly",
    )

    def __init__(self) -> None:
        self.settings = get_settings()

    def seed_locations(self, db: Session) -> None:
        items = list_locations()
        bind = getattr(db, "bind", None)
        dialect_name = str(getattr(getattr(bind, "dialect", None), "name", "") or "")

        if dialect_name == "postgresql":
            payload = [
                {
                    "id": item["id"],
                    "name": item["name"],
                    "country": item["country"],
                    "latitude": item["lat"],
                    "longitude": item["lon"],
                    "exposure_index": item["exposure_index"],
                    "vulnerability_index": item["vulnerability_index"],
                }
                for item in items
            ]
            if payload:
                stmt = pg_insert(models.Location).values(payload)
                stmt = stmt.on_conflict_do_update(
                    index_elements=[models.Location.id],
                    set_={
                        "name": stmt.excluded.name,
                        "country": stmt.excluded.country,
                        "latitude": stmt.excluded.latitude,
                        "longitude": stmt.excluded.longitude,
                        "exposure_index": stmt.excluded.exposure_index,
                        "vulnerability_index": stmt.excluded.vulnerability_index,
                        "updated_at": datetime.now(timezone.utc).replace(tzinfo=None),
                    },
                )
                db.execute(stmt)
                db.commit()
                return

        for item in items:
            existing = db.query(models.Location).filter(models.Location.id == item["id"]).first()
            if existing:
                existing.name = item["name"]
                existing.country = item["country"]
                existing.latitude = item["lat"]
                existing.longitude = item["lon"]
                existing.exposure_index = item["exposure_index"]
                existing.vulnerability_index = item["vulnerability_index"]
            else:
                db.add(
                    models.Location(
                        id=item["id"],
                        name=item["name"],
                        country=item["country"],
                        latitude=item["lat"],
                        longitude=item["lon"],
                        exposure_index=item["exposure_index"],
                        vulnerability_index=item["vulnerability_index"],
                    )
                )
        db.commit()

    def run_for_all_locations(self) -> dict:
        targets = list_locations(core_only=self.settings.ingest_core_locations_only)
        stats = {"ok": 0, "failed": 0, "locations": [], "target_count": len(targets), "core_only": self.settings.ingest_core_locations_only}
        for location in targets:
            result = self.run_for_location(location["id"])
            stats["locations"].append(result)
            if result["status"] == "ok":
                stats["ok"] += 1
            else:
                stats["failed"] += 1
        return stats

    def run_for_location(self, location_id: str) -> dict:
        with SessionLocal() as db:
            self.seed_locations(db)
            location = get_location(location_id)
            run = models.IngestionRun(location_id=location_id)
            db.add(run)
            db.commit()

            try:
                results: List[ConnectorResult] = [
                    fetch_open_meteo(location["lat"], location["lon"]),
                    fetch_nasa_power(location["lat"], location["lon"]),
                    fetch_openaq(location["lat"], location["lon"]),
                    fetch_reliefweb_events(location["name"]),
                    fetch_gdelt_news(location["name"]),
                    fetch_news_rss(location["name"]),
                    fetch_emdat_events(location["name"]),
                    fetch_copernicus_era5(location["lat"], location["lon"]),
                ]

                warnings: List[str] = []
                source_attribution = []
                for result in results:
                    source_attribution.append(
                        {
                            "source": result.metadata.source,
                            "source_url": result.metadata.source_url,
                            "timestamp_utc": datetime.now(timezone.utc).isoformat(),
                            "license_tag": result.metadata.license_tag,
                            "freshness_minutes": result.metadata.freshness_sla_minutes,
                            "trust_score": self._source_trust(result.metadata.source),
                        }
                    )
                    self._save_observations(db, location_id, result)
                    self._save_events(db, location_id, result)

                features, completeness, warnings = self._build_features(db, location_id, warnings)
                risk = calculate_risk(
                    features=features,
                    exposure=location["exposure_index"],
                    vulnerability=location["vulnerability_index"],
                    data_completeness=completeness,
                )

                risk_snapshot = models.RiskSnapshot(
                    location_id=location_id,
                    hazard_score=risk["hazard"],
                    exposure_score=risk["exposure"],
                    vulnerability_score=risk["vulnerability"],
                    overall_score=risk["overall"],
                    confidence=risk["confidence"],
                    uncertainty_low=risk["uncertainty_low"],
                    uncertainty_high=risk["uncertainty_high"],
                    primary_threat=risk["primary_threat"],
                    probability_30d=risk["probability_30d"],
                    details_json={
                        "features": features,
                        "hazard_components": risk["hazard_components"],
                        "warnings": warnings,
                        "data_completeness": round(completeness, 3),
                    },
                    source_attribution_json=source_attribution,
                )

                db.add(risk_snapshot)
                db.flush()
                self._save_risk_features(db, risk_snapshot.id, location_id, features)

                run.status = "completed"
                run.warning_count = len(warnings)
                run.completed_at = datetime.now(timezone.utc)
                db.commit()
                INGEST_RUN_COUNT.labels(status="completed").inc()

                if warnings:
                    logger.warning("Ingestion completed with warnings for %s: %s", location_id, ",".join(warnings))

                return {
                    "status": "ok",
                    "location_id": location_id,
                    "risk": risk["overall"],
                    "warnings": warnings,
                }
            except Exception as exc:
                run.status = "failed"
                run.error_message = str(exc)
                run.completed_at = datetime.now(timezone.utc)
                db.commit()
                INGEST_RUN_COUNT.labels(status="failed").inc()
                logger.exception("Ingestion failed for %s", location_id)
                return {"status": "failed", "location_id": location_id, "error": str(exc)}

    def _save_observations(self, db: Session, location_id: str, connector_result: ConnectorResult) -> None:
        for item in connector_result.observations:
            metric = item.get("metric")
            value = item.get("value")
            ts = item.get("ts") or datetime.now(timezone.utc)
            if metric is None or value is None:
                continue

            exists = (
                db.query(models.Observation.id)
                .filter(models.Observation.location_id == location_id)
                .filter(models.Observation.metric == metric)
                .filter(models.Observation.ts == ts)
                .filter(models.Observation.source == connector_result.metadata.source)
                .first()
            )
            if exists:
                continue

            db.add(
                models.Observation(
                    location_id=location_id,
                    metric=str(metric),
                    ts=ts,
                    value=float(value),
                    unit=str(item.get("unit", "")) or "unit",
                    source=connector_result.metadata.source,
                    source_url=connector_result.metadata.source_url,
                    license_tag=connector_result.metadata.license_tag,
                    confidence=float(item.get("confidence", self._source_trust(connector_result.metadata.source))),
                )
            )
        db.commit()

    def _save_events(self, db: Session, location_id: str, connector_result: ConnectorResult) -> None:
        for event in connector_result.events:
            title = str(event.get("title", ""))[:500]
            summary = str(event.get("summary", ""))[:3900]
            occurred_at = event.get("occurred_at") or datetime.now(timezone.utc)
            if not title:
                continue
            if not self._is_climate_signal_event(connector_result.metadata.source, title, summary):
                continue

            exists = (
                db.query(models.Event.id)
                .filter(models.Event.location_id == location_id)
                .filter(models.Event.title == title)
                .filter(models.Event.occurred_at == occurred_at)
                .filter(models.Event.source == connector_result.metadata.source)
                .first()
            )
            if exists:
                continue

            db.add(
                models.Event(
                    location_id=location_id,
                    event_type=str(event.get("event_type", "signal"))[:60],
                    severity=str(event.get("severity", "medium"))[:30],
                    title=title,
                    summary=summary,
                    occurred_at=occurred_at,
                    source=connector_result.metadata.source,
                    source_url=str(event.get("source_url") or connector_result.metadata.source_url)[:500],
                    license_tag=connector_result.metadata.license_tag,
                )
            )
        db.commit()

    def _is_climate_signal_event(self, source: str, title: str, summary: str) -> bool:
        if source not in {"gdelt", "news_rss"}:
            return True
        text = f"{title} {summary}".lower()
        return any(keyword in text for keyword in self.CLIMATE_SIGNAL_KEYWORDS)

    def _latest_metric(self, db: Session, location_id: str, metric: str) -> float | None:
        rows = (
            db.query(models.Observation)
            .filter(models.Observation.location_id == location_id)
            .filter(models.Observation.metric == metric)
            .order_by(models.Observation.ts.desc())
            .limit(30)
            .all()
        )
        if not rows:
            return None

        best_value = None
        best_score = -1.0
        now = datetime.now(timezone.utc)
        for row in rows:
            row_ts = row.ts if row.ts.tzinfo else row.ts.replace(tzinfo=timezone.utc)
            age_hours = max(0.0, (now - row_ts).total_seconds() / 3600.0)
            freshness_score = self._clamp(1.0 - (age_hours / 48.0))
            confidence_score = self._clamp(float(row.confidence))
            trust_score = self._source_trust(row.source)
            rank_score = (0.55 * confidence_score) + (0.25 * trust_score) + (0.20 * freshness_score)
            if rank_score > best_score:
                best_score = rank_score
                best_value = float(row.value)

        return best_value

    def _source_trust(self, source: str) -> float:
        return float(self.SOURCE_TRUST.get(source, 0.75))

    @staticmethod
    def _clamp(value: float, min_value: float = 0.0, max_value: float = 1.0) -> float:
        return max(min_value, min(max_value, value))

    def _build_features(self, db: Session, location_id: str, warnings: List[str]) -> tuple[Dict[str, float], float, List[str]]:
        temperature_c = self._latest_metric(db, location_id, "temperature_c")
        historical_c = self._latest_metric(db, location_id, "historical_avg_temperature_c")
        wind_kmh = self._latest_metric(db, location_id, "wind_kmh")
        pm25 = self._latest_metric(db, location_id, "pm25")

        latest_precip_prob = (
            db.query(models.Observation)
            .filter(models.Observation.location_id == location_id)
            .filter(models.Observation.metric == "forecast_precip_prob_pct")
            .order_by(models.Observation.ts.desc())
            .limit(8)
            .all()
        )
        precip_candidates = [float(item.value) for item in latest_precip_prob]
        precip_prob = max(precip_candidates) if precip_candidates else None

        recent_events_count = (
            db.query(models.Event)
            .filter(models.Event.location_id == location_id)
            .filter(models.Event.occurred_at >= datetime.now(timezone.utc) - timedelta(days=7))
            .count()
        )

        required = {
            "temperature_c": temperature_c,
            "historical_avg_temperature_c": historical_c,
            "precip_prob": precip_prob,
            "wind_kmh": wind_kmh,
            "pm25": pm25,
        }

        for name, value in required.items():
            if value is None:
                warnings.append(f"missing_metric:{name}")

        latest_core_observation = (
            db.query(models.Observation)
            .filter(models.Observation.location_id == location_id)
            .order_by(models.Observation.ts.desc())
            .first()
        )
        if latest_core_observation:
            obs_ts = latest_core_observation.ts
            if obs_ts.tzinfo is None:
                obs_ts = obs_ts.replace(tzinfo=timezone.utc)
            age_minutes = (datetime.now(timezone.utc) - obs_ts).total_seconds() / 60.0
            if age_minutes > self.settings.data_freshness_minutes:
                warnings.append(f"stale_data:latest_observation_age_min={int(age_minutes)}")

        if temperature_c is not None and (temperature_c < -60 or temperature_c > 65):
            warnings.append("outlier:temperature_c")
        if wind_kmh is not None and wind_kmh > 220:
            warnings.append("outlier:wind_kmh")
        if pm25 is not None and pm25 > 1200:
            warnings.append("outlier:pm25")

        present = sum(1 for _, value in required.items() if value is not None)
        completeness = present / len(required)

        temp_val = temperature_c if temperature_c is not None else 25.0
        hist_val = historical_c if historical_c is not None else temp_val

        features = {
            "temperature_c": float(temp_val),
            "temp_anomaly_c": float(temp_val - hist_val),
            "precip_prob": float(precip_prob if precip_prob is not None else 30.0),
            "wind_kmh": float(wind_kmh if wind_kmh is not None else 12.0),
            "pm25": float(pm25 if pm25 is not None else 22.0),
            "recent_event_count": float(recent_events_count),
        }
        return features, completeness, warnings

    def _save_risk_features(self, db: Session, risk_snapshot_id: int, location_id: str, features: Dict[str, float]) -> None:
        for feature_name, feature_value in features.items():
            db.add(
                models.RiskFeature(
                    risk_snapshot_id=risk_snapshot_id,
                    location_id=location_id,
                    feature_name=feature_name,
                    feature_value=float(feature_value),
                    source="derived_features",
                    confidence=0.82,
                )
            )
        db.commit()

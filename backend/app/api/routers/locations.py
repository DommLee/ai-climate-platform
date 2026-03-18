from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import and_, func
from sqlalchemy.orm import Session

from app import models
from app.api.deps import get_ingestion_service, get_llm_router
from app.database import get_db
from app.ingestion.service import IngestionService
from app.llm_router.models import InsightRequest
from app.llm_router.router import LLMRouter
from app.locations import list_locations
from app.observability import LLM_DECISION_COUNT
from app.schemas import (
    CurrentWeather,
    EventsResponse,
    InsightContent,
    InsightsResponse,
    LocationItem,
    LocationRiskItem,
    LocationsRankingResponse,
    RiskFeaturesResponse,
    RisksResponse,
    RiskBreakdown,
    SnapshotResponse,
    SourceAttribution,
    TimeseriesPoint,
    TimeseriesResponse,
)

router = APIRouter(prefix="/locations", tags=["locations"])


def _as_naive_utc(dt: datetime) -> datetime:
    if dt.tzinfo is not None:
        return dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt


def _latest_observation(db: Session, location_id: str, metric: str) -> models.Observation | None:
    return (
        db.query(models.Observation)
        .filter(models.Observation.location_id == location_id)
        .filter(models.Observation.metric == metric)
        .order_by(models.Observation.ts.desc())
        .first()
    )


def _latest_risk(db: Session, location_id: str) -> models.RiskSnapshot | None:
    return (
        db.query(models.RiskSnapshot)
        .filter(models.RiskSnapshot.location_id == location_id)
        .order_by(models.RiskSnapshot.generated_at.desc())
        .first()
    )


def _format_source_attr(items: list[dict]) -> list[SourceAttribution]:
    out = []
    for item in items:
        try:
            out.append(
                SourceAttribution(
                    source=str(item.get("source", "unknown")),
                    source_url=str(item.get("source_url", "")),
                    timestamp_utc=datetime.fromisoformat(str(item.get("timestamp_utc")).replace("Z", "+00:00")),
                    license_tag=str(item.get("license_tag", "unknown")),
                    freshness_minutes=int(item.get("freshness_minutes", 0)),
                    trust_score=float(item.get("trust_score")) if item.get("trust_score") is not None else None,
                )
            )
        except Exception:
            continue
    return out


def _build_risk_payload(risk: models.RiskSnapshot) -> RiskBreakdown:
    return RiskBreakdown(
        hazard=float(risk.hazard_score),
        exposure=float(risk.exposure_score),
        vulnerability=float(risk.vulnerability_score),
        overall=float(risk.overall_score),
        primary_threat=risk.primary_threat,
        probability_30d=float(risk.probability_30d),
        confidence=float(risk.confidence),
        uncertainty_band=[float(risk.uncertainty_low), float(risk.uncertainty_high)],
    )


@router.get("", response_model=list[LocationItem])
def get_locations() -> list[LocationItem]:
    return [
        LocationItem(id=item["id"], name=item["name"], country=item["country"], lat=item["lat"], lon=item["lon"])
        for item in list_locations()
    ]


@router.get("/rankings", response_model=LocationsRankingResponse)
def get_location_rankings(
    limit: int = Query(10, ge=1, le=100),
    country: str | None = Query(None, min_length=2, max_length=3),
    db: Session = Depends(get_db),
) -> LocationsRankingResponse:
    latest_risk_by_location = (
        db.query(
            models.RiskSnapshot.location_id.label("location_id"),
            func.max(models.RiskSnapshot.generated_at).label("max_generated_at"),
        )
        .group_by(models.RiskSnapshot.location_id)
        .subquery()
    )

    rows = (
        db.query(models.RiskSnapshot)
        .join(
            latest_risk_by_location,
            and_(
                models.RiskSnapshot.location_id == latest_risk_by_location.c.location_id,
                models.RiskSnapshot.generated_at == latest_risk_by_location.c.max_generated_at,
            ),
        )
        .all()
    )
    if not rows:
        raise HTTPException(status_code=404, detail="No risk snapshots available for ranking")

    location_ids = sorted({row.location_id for row in rows})
    location_rows = db.query(models.Location).filter(models.Location.id.in_(location_ids)).all()
    location_map = {item.id: item for item in location_rows}
    country_filter = country.upper() if country else None

    items = []
    for row in rows:
        location = location_map.get(row.location_id)
        if not location:
            continue
        if country_filter and location.country.upper() != country_filter:
            continue

        items.append(
            LocationRiskItem(
                location_id=row.location_id,
                location_name=location.name,
                country=location.country,
                generated_at=row.generated_at,
                overall_score=float(row.overall_score),
                primary_threat=row.primary_threat,
                confidence=float(row.confidence),
                uncertainty_band=[float(row.uncertainty_low), float(row.uncertainty_high)],
            )
        )

    items.sort(key=lambda item: item.overall_score, reverse=True)
    return LocationsRankingResponse(
        generated_at=datetime.now(timezone.utc),
        items=items[:limit],
    )


@router.get("/{location_id}/snapshot", response_model=SnapshotResponse)
def get_snapshot(
    location_id: str,
    db: Session = Depends(get_db),
    ingestion: IngestionService = Depends(get_ingestion_service),
) -> SnapshotResponse:
    location = db.query(models.Location).filter(models.Location.id == location_id).first()
    if not location:
        raise HTTPException(status_code=404, detail="Unknown location_id")

    risk = _latest_risk(db, location_id)
    if not risk:
        ingestion.run_for_location(location_id)
        risk = _latest_risk(db, location_id)

    if not risk:
        raise HTTPException(status_code=503, detail="No risk data available yet")

    temperature = _latest_observation(db, location_id, "temperature_c")
    humidity = _latest_observation(db, location_id, "humidity_pct")
    wind = _latest_observation(db, location_id, "wind_kmh")
    precipitation = _latest_observation(db, location_id, "precipitation_mm")
    pressure = _latest_observation(db, location_id, "pressure_hpa")
    pm25 = _latest_observation(db, location_id, "pm25")

    if not all([temperature, humidity, wind, precipitation, pressure]):
        raise HTTPException(status_code=503, detail="Core weather metrics are missing")

    source_attr = _format_source_attr(risk.source_attribution_json if isinstance(risk.source_attribution_json, list) else [])

    return SnapshotResponse(
        location_id=location_id,
        location_name=location.name,
        generated_at=risk.generated_at,
        current_weather=CurrentWeather(
            temperature_c=float(temperature.value),
            humidity_pct=float(humidity.value),
            wind_kmh=float(wind.value),
            precipitation_mm=float(precipitation.value),
            pressure_hpa=float(pressure.value),
            pm25=float(pm25.value) if pm25 else None,
        ),
        risk=_build_risk_payload(risk),
        source_attribution=source_attr,
        license_tag="mixed-source-non-commercial",
    )


@router.get("/{location_id}/timeseries", response_model=TimeseriesResponse)
def get_timeseries(
    location_id: str,
    metric: str,
    from_ts: datetime | None = Query(None, alias="from"),
    to_ts: datetime | None = Query(None, alias="to"),
    db: Session = Depends(get_db),
) -> TimeseriesResponse:
    from_dt = _as_naive_utc(from_ts) if from_ts else datetime.utcnow() - timedelta(days=2)
    to_dt = _as_naive_utc(to_ts) if to_ts else datetime.utcnow()

    rows = (
        db.query(models.Observation)
        .filter(models.Observation.location_id == location_id)
        .filter(models.Observation.metric == metric)
        .filter(models.Observation.ts >= from_dt)
        .filter(models.Observation.ts <= to_dt)
        .order_by(models.Observation.ts.asc())
        .all()
    )
    if not rows:
        raise HTTPException(status_code=404, detail="No timeseries data for requested metric")

    return TimeseriesResponse(
        location_id=location_id,
        metric=metric,
        unit=rows[0].unit,
        generated_at=datetime.now(timezone.utc),
        points=[TimeseriesPoint(timestamp=row.ts, value=float(row.value), source=row.source) for row in rows],
    )


@router.get("/{location_id}/risks", response_model=RisksResponse)
def get_risks(location_id: str, db: Session = Depends(get_db)) -> RisksResponse:
    risk = _latest_risk(db, location_id)
    if not risk:
        raise HTTPException(status_code=404, detail="Risk snapshot not found")

    history_rows = (
        db.query(models.RiskSnapshot)
        .filter(models.RiskSnapshot.location_id == location_id)
        .order_by(models.RiskSnapshot.generated_at.desc())
        .limit(48)
        .all()
    )

    history = [
        {
            "generated_at": row.generated_at.isoformat(),
            "overall": float(row.overall_score),
            "hazard": float(row.hazard_score),
            "confidence": float(row.confidence),
        }
        for row in reversed(history_rows)
    ]

    source_attr = _format_source_attr(risk.source_attribution_json if isinstance(risk.source_attribution_json, list) else [])

    return RisksResponse(
        location_id=location_id,
        generated_at=risk.generated_at,
        latest=_build_risk_payload(risk),
        history=history,
        source_attribution=source_attr,
        license_tag="mixed-source-non-commercial",
    )


@router.get("/{location_id}/risk-features", response_model=RiskFeaturesResponse)
def get_risk_features(location_id: str, db: Session = Depends(get_db)) -> RiskFeaturesResponse:
    latest_risk = _latest_risk(db, location_id)
    if not latest_risk:
        raise HTTPException(status_code=404, detail="Risk snapshot not found")

    rows = (
        db.query(models.RiskFeature)
        .filter(models.RiskFeature.risk_snapshot_id == latest_risk.id)
        .order_by(models.RiskFeature.feature_name.asc())
        .all()
    )
    return RiskFeaturesResponse(
        location_id=location_id,
        generated_at=latest_risk.generated_at,
        items=[
            {
                "feature_name": row.feature_name,
                "feature_value": float(row.feature_value),
                "source": row.source,
                "confidence": float(row.confidence),
                "generated_at": row.generated_at,
            }
            for row in rows
        ],
    )


@router.get("/{location_id}/events", response_model=EventsResponse)
def get_events(
    location_id: str,
    limit: int = Query(25, ge=1, le=200),
    db: Session = Depends(get_db),
) -> EventsResponse:
    rows = (
        db.query(models.Event)
        .filter(models.Event.location_id == location_id)
        .order_by(models.Event.occurred_at.desc())
        .limit(limit)
        .all()
    )

    latest_risk = _latest_risk(db, location_id)
    source_attr = []
    if latest_risk and isinstance(latest_risk.source_attribution_json, list):
        source_attr = _format_source_attr(latest_risk.source_attribution_json)

    return EventsResponse(
        location_id=location_id,
        generated_at=datetime.now(timezone.utc),
        items=[
            {
                "id": row.id,
                "event_type": row.event_type,
                "severity": row.severity,
                "title": row.title,
                "summary": row.summary,
                "occurred_at": row.occurred_at,
                "source": row.source,
                "source_url": row.source_url,
                "license_tag": row.license_tag,
            }
            for row in rows
        ],
        source_attribution=source_attr,
        license_tag="mixed-source-non-commercial",
    )


@router.get("/{location_id}/insights", response_model=InsightsResponse)
def get_insights(
    location_id: str,
    lang: str = Query("tr", pattern="^(tr|en)$"),
    force_refresh: bool = False,
    db: Session = Depends(get_db),
    llm_router: LLMRouter = Depends(get_llm_router),
) -> InsightsResponse:
    location = db.query(models.Location).filter(models.Location.id == location_id).first()
    if not location:
        raise HTTPException(status_code=404, detail="Unknown location_id")

    latest_risk = _latest_risk(db, location_id)
    if not latest_risk:
        raise HTTPException(status_code=404, detail="Risk snapshot not found")

    if not force_refresh:
        existing = (
            db.query(models.Insight)
            .filter(models.Insight.location_id == location_id)
            .filter(models.Insight.lang == lang)
            .order_by(models.Insight.generated_at.desc())
            .first()
        )
        if existing and _as_naive_utc(existing.generated_at) >= datetime.utcnow() - timedelta(minutes=60):
            content = InsightContent.model_validate(existing.content_json)
            source_attr = _format_source_attr(latest_risk.source_attribution_json if isinstance(latest_risk.source_attribution_json, list) else [])
            return InsightsResponse(
                location_id=location_id,
                lang=lang,
                provider=existing.provider,
                model=existing.model,
                generated_at=existing.generated_at,
                content=content,
                source_attribution=source_attr,
                license_tag="mixed-source-non-commercial",
            )

    evidence = []
    for item in latest_risk.source_attribution_json if isinstance(latest_risk.source_attribution_json, list) else []:
        evidence.append(
            {
                "source": item.get("source"),
                "source_url": item.get("source_url"),
                "title": f"{item.get('source')} source stream",
                "summary": "Live climate signal and observations used in risk scoring.",
                "timestamp_utc": item.get("timestamp_utc"),
            }
        )

    latest_events = (
        db.query(models.Event)
        .filter(models.Event.location_id == location_id)
        .order_by(models.Event.occurred_at.desc())
        .limit(10)
        .all()
    )
    for event in latest_events:
        evidence.append(
            {
                "source": event.source,
                "source_url": event.source_url,
                "title": event.title,
                "summary": event.summary,
                "timestamp_utc": event.occurred_at.isoformat(),
            }
        )

    payload, decision = llm_router.generate_insight(
        InsightRequest(
            location_id=location_id,
            location_name=location.name,
            lang=lang,
            risk_score=float(latest_risk.overall_score),
            primary_threat=latest_risk.primary_threat,
            evidence=evidence,
        )
    )

    record = models.Insight(
        location_id=location_id,
        lang=lang,
        provider=decision.provider,
        model=decision.model,
        content_json=payload.model_dump(mode="json"),
        citations_json=[item.model_dump(mode="json") for item in payload.citations],
    )
    db.add(record)
    db.commit()
    db.refresh(record)

    db.add(
        models.ModelDecision(
            location_id=location_id,
            insight_id=record.id,
            provider=decision.provider,
            model=decision.model,
            prompt_version=decision.prompt_version,
            fallback_used=decision.fallback_used,
            input_chars=decision.input_chars,
            evidence_count=decision.evidence_count,
            output_tokens_estimate=decision.output_tokens_estimate,
            estimated_cost_usd=decision.estimated_cost_usd,
            error_chain=decision.error_chain,
        )
    )
    db.commit()
    LLM_DECISION_COUNT.labels(provider=decision.provider, fallback=str(decision.fallback_used).lower()).inc()

    source_attr = _format_source_attr(latest_risk.source_attribution_json if isinstance(latest_risk.source_attribution_json, list) else [])

    return InsightsResponse(
        location_id=location_id,
        lang=lang,
        provider=decision.provider,
        model=decision.model,
        generated_at=record.generated_at,
        content=InsightContent.model_validate(payload.model_dump(mode="json")),
        source_attribution=source_attr,
        license_tag="mixed-source-non-commercial",
    )

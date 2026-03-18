from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import (
    JSON,
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    LargeBinary,
    String,
    Text,
    UniqueConstraint,
)

from app.database import Base


class Location(Base):
    __tablename__ = "locations"

    id = Column(String(64), primary_key=True)
    name = Column(String(128), nullable=False)
    country = Column(String(64), nullable=False, default="TR")
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    exposure_index = Column(Float, nullable=False, default=0.45)
    vulnerability_index = Column(Float, nullable=False, default=0.42)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)


class Observation(Base):
    __tablename__ = "observations"

    id = Column(Integer, primary_key=True, autoincrement=True)
    location_id = Column(String(64), ForeignKey("locations.id"), nullable=False)
    metric = Column(String(96), nullable=False)
    ts = Column(DateTime, nullable=False)
    value = Column(Float, nullable=False)
    unit = Column(String(24), nullable=False)
    source = Column(String(64), nullable=False)
    source_url = Column(String(512), nullable=False)
    license_tag = Column(String(128), nullable=False)
    confidence = Column(Float, nullable=False, default=0.8)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("location_id", "metric", "ts", "source", name="uq_observation_dedup"),
        Index("ix_observations_lookup", "location_id", "metric", "ts"),
    )


class Event(Base):
    __tablename__ = "events"

    id = Column(Integer, primary_key=True, autoincrement=True)
    location_id = Column(String(64), ForeignKey("locations.id"), nullable=False)
    event_type = Column(String(64), nullable=False)
    severity = Column(String(32), nullable=False, default="medium")
    title = Column(String(512), nullable=False)
    summary = Column(Text, nullable=False)
    occurred_at = Column(DateTime, nullable=False)
    source = Column(String(64), nullable=False)
    source_url = Column(String(512), nullable=False)
    license_tag = Column(String(128), nullable=False)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("location_id", "title", "occurred_at", "source", name="uq_event_dedup"),
        Index("ix_events_lookup", "location_id", "occurred_at"),
    )


class RiskSnapshot(Base):
    __tablename__ = "risk_snapshots"

    id = Column(Integer, primary_key=True, autoincrement=True)
    location_id = Column(String(64), ForeignKey("locations.id"), nullable=False)
    generated_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    hazard_score = Column(Float, nullable=False)
    exposure_score = Column(Float, nullable=False)
    vulnerability_score = Column(Float, nullable=False)
    overall_score = Column(Float, nullable=False)

    confidence = Column(Float, nullable=False)
    uncertainty_low = Column(Float, nullable=False)
    uncertainty_high = Column(Float, nullable=False)

    primary_threat = Column(String(64), nullable=False)
    probability_30d = Column(Float, nullable=False)

    details_json = Column(JSON, nullable=False, default=dict)
    source_attribution_json = Column(JSON, nullable=False, default=list)

    __table_args__ = (
        Index("ix_risk_lookup", "location_id", "generated_at"),
    )


class RiskFeature(Base):
    __tablename__ = "risk_features"

    id = Column(Integer, primary_key=True, autoincrement=True)
    risk_snapshot_id = Column(Integer, ForeignKey("risk_snapshots.id"), nullable=False)
    location_id = Column(String(64), ForeignKey("locations.id"), nullable=False)
    generated_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    feature_name = Column(String(128), nullable=False)
    feature_value = Column(Float, nullable=False)
    source = Column(String(64), nullable=False)
    confidence = Column(Float, nullable=False, default=0.8)

    __table_args__ = (
        UniqueConstraint("risk_snapshot_id", "feature_name", name="uq_risk_feature"),
        Index("ix_risk_feature_lookup", "location_id", "generated_at", "feature_name"),
    )


class Insight(Base):
    __tablename__ = "insights"

    id = Column(Integer, primary_key=True, autoincrement=True)
    location_id = Column(String(64), ForeignKey("locations.id"), nullable=False)
    lang = Column(String(8), nullable=False)
    provider = Column(String(32), nullable=False)
    model = Column(String(128), nullable=False)

    generated_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    content_json = Column(JSON, nullable=False, default=dict)
    citations_json = Column(JSON, nullable=False, default=list)

    __table_args__ = (
        Index("ix_insight_lookup", "location_id", "lang", "generated_at"),
    )


class ModelDecision(Base):
    __tablename__ = "model_decisions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    location_id = Column(String(64), ForeignKey("locations.id"), nullable=False)
    insight_id = Column(Integer, ForeignKey("insights.id"), nullable=True)
    provider = Column(String(32), nullable=False)
    model = Column(String(128), nullable=False)
    prompt_version = Column(String(64), nullable=False, default="v1")
    fallback_used = Column(Boolean, nullable=False, default=False)
    input_chars = Column(Integer, nullable=False, default=0)
    evidence_count = Column(Integer, nullable=False, default=0)
    output_tokens_estimate = Column(Integer, nullable=False, default=0)
    estimated_cost_usd = Column(Float, nullable=False, default=0.0)
    error_chain = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    __table_args__ = (
        Index("ix_model_decision_lookup", "location_id", "created_at"),
    )


class ReportJob(Base):
    __tablename__ = "report_jobs"

    id = Column(String(64), primary_key=True, default=lambda: str(uuid.uuid4()))
    location_id = Column(String(64), ForeignKey("locations.id"), nullable=False)
    lang = Column(String(8), nullable=False, default="tr")
    status = Column(String(24), nullable=False, default="pending")

    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    request_payload_json = Column(JSON, nullable=False, default=dict)
    output_path = Column(String(1024), nullable=True)
    error_message = Column(Text, nullable=True)

    __table_args__ = (
        Index("ix_report_jobs_status", "status", "created_at"),
    )


class IngestionRun(Base):
    __tablename__ = "ingestion_runs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    location_id = Column(String(64), ForeignKey("locations.id"), nullable=False)
    started_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)
    status = Column(String(24), nullable=False, default="running")
    warning_count = Column(Integer, nullable=False, default=0)
    error_message = Column(Text, nullable=True)


class GeoCache(Base):
    __tablename__ = "geo_cache"

    id = Column(Integer, primary_key=True, autoincrement=True)
    query = Column(String(256), nullable=False, unique=True)
    result_json = Column(JSON, nullable=False, default=dict)
    fetched_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    expires_at = Column(DateTime, nullable=False)


class TileCache(Base):
    __tablename__ = "tile_cache"

    id = Column(Integer, primary_key=True, autoincrement=True)
    z = Column(Integer, nullable=False)
    x = Column(Integer, nullable=False)
    y = Column(Integer, nullable=False)
    content_type = Column(String(80), nullable=False, default="image/png")
    image_data = Column(LargeBinary, nullable=False)
    etag = Column(String(256), nullable=True)
    fetched_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    expires_at = Column(DateTime, nullable=False)

    __table_args__ = (
        UniqueConstraint("z", "x", "y", name="uq_tile_key"),
        Index("ix_tile_cache_lookup", "z", "x", "y", "expires_at"),
    )


class UserFeedback(Base):
    __tablename__ = "user_feedback"

    id = Column(Integer, primary_key=True, autoincrement=True)
    location_id = Column(String(64), ForeignKey("locations.id"), nullable=False)
    rating = Column(Integer, nullable=False, default=3)
    comment = Column(Text, nullable=True)
    correction_json = Column(JSON, nullable=False, default=dict)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    __table_args__ = (
        Index("ix_feedback_lookup", "location_id", "created_at"),
    )

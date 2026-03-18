from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field


class SourceAttribution(BaseModel):
    source: str
    source_url: str
    timestamp_utc: datetime
    license_tag: str
    freshness_minutes: int
    trust_score: float | None = None


class CurrentWeather(BaseModel):
    temperature_c: float
    humidity_pct: float
    wind_kmh: float
    precipitation_mm: float
    pressure_hpa: float
    pm25: Optional[float] = None


class RiskBreakdown(BaseModel):
    hazard: float
    exposure: float
    vulnerability: float
    overall: float
    primary_threat: str
    probability_30d: float
    confidence: float
    uncertainty_band: List[float] = Field(min_length=2, max_length=2)


class SnapshotResponse(BaseModel):
    location_id: str
    location_name: str
    generated_at: datetime
    current_weather: CurrentWeather
    risk: RiskBreakdown
    source_attribution: List[SourceAttribution]
    license_tag: str


class TimeseriesPoint(BaseModel):
    timestamp: datetime
    value: float
    source: str


class TimeseriesResponse(BaseModel):
    location_id: str
    metric: str
    unit: str
    generated_at: datetime
    points: List[TimeseriesPoint]


class RisksResponse(BaseModel):
    location_id: str
    generated_at: datetime
    latest: RiskBreakdown
    history: List[dict]
    source_attribution: List[SourceAttribution]
    license_tag: str


class EventItem(BaseModel):
    id: int
    event_type: str
    severity: str
    title: str
    summary: str
    occurred_at: datetime
    source: str
    source_url: str
    license_tag: str


class EventsResponse(BaseModel):
    location_id: str
    generated_at: datetime
    items: List[EventItem]
    source_attribution: List[SourceAttribution]
    license_tag: str


class RiskFeatureItem(BaseModel):
    feature_name: str
    feature_value: float
    source: str
    confidence: float
    generated_at: datetime


class RiskFeaturesResponse(BaseModel):
    location_id: str
    generated_at: datetime
    items: List[RiskFeatureItem]


class InsightCitation(BaseModel):
    source: str
    source_url: str
    timestamp_utc: datetime


class InsightContent(BaseModel):
    summary: str
    risk_rationale: str
    recommendations: List[str]
    first_72h_action_plan: List[str]
    citations: List[InsightCitation]


class InsightsResponse(BaseModel):
    location_id: str
    lang: str
    provider: str
    model: str
    generated_at: datetime
    content: InsightContent
    source_attribution: List[SourceAttribution]
    license_tag: str


class ReportCreateRequest(BaseModel):
    location_id: str = "istanbul"
    lang: str = "tr"


class ReportResponse(BaseModel):
    id: str
    location_id: str
    lang: str
    status: str
    created_at: datetime
    updated_at: datetime
    output_url: Optional[str] = None
    duration_seconds: Optional[float] = None
    error_message: Optional[str] = None


class SourceDescriptor(BaseModel):
    id: str
    description: str
    source_url: str
    license_tag: str
    freshness_sla_minutes: int


class SourcesResponse(BaseModel):
    generated_at: datetime
    items: List[SourceDescriptor]


class LocationItem(BaseModel):
    id: str
    name: str
    country: str
    lat: float
    lon: float


class LocationRiskItem(BaseModel):
    location_id: str
    location_name: str
    country: str
    generated_at: datetime
    overall_score: float
    primary_threat: str
    confidence: float
    uncertainty_band: List[float] = Field(min_length=2, max_length=2)


class LocationsRankingResponse(BaseModel):
    generated_at: datetime
    items: List[LocationRiskItem]


class CountrySignalItem(BaseModel):
    source: str
    event_type: str
    severity: str
    title: str
    summary: str
    occurred_at: datetime
    source_url: str


class CountrySignalSummary(BaseModel):
    lookback_days: int
    total_signals: int
    disaster_signals: int
    news_signals: int
    high_severity_signals: int
    primary_threat: str
    computed_risk_score: float


class CountrySignalTimelinePoint(BaseModel):
    bucket_start: datetime
    bucket_end: datetime
    signal_count: int
    high_severity_count: int
    disaster_count: int


class CountryThreatCount(BaseModel):
    threat: str
    count: int


class CountryHistoricalSummary(BaseModel):
    lookback_days: int
    bucket_days: int
    trend_direction: str
    average_daily_signals: float
    recent_7d_signals: int
    top_threats: List[CountryThreatCount]
    timeline: List[CountrySignalTimelinePoint]


class CountryInsight(BaseModel):
    provider: str
    model: str
    generated_at: datetime
    content: InsightContent


class CountryMacroMetric(BaseModel):
    indicator_id: str
    label: str
    unit: str | None = None
    value: float | None = None
    year: int | None = None
    benchmark_value: float | None = None
    benchmark_year: int | None = None
    benchmark_label: str | None = "World"
    delta_pct_vs_benchmark: float | None = None
    source: str = "world_bank"


class CountryResilienceDimension(BaseModel):
    name: str
    score: float = Field(ge=0, le=100)
    narrative: str


class CountryResilienceScorecard(BaseModel):
    overall_resilience_score: float = Field(ge=0, le=100)
    climate_pressure_score: float = Field(ge=0, le=100)
    adaptation_readiness_score: float = Field(ge=0, le=100)
    dimensions: List[CountryResilienceDimension]
    narrative: str


class CountryNarrativeBlock(BaseModel):
    executive_brief: str
    climate_context: str
    sustainability_context: str
    watch_items_30d: List[str]
    action_tracks_90d: List[str]


class CountryProfileResponse(BaseModel):
    country_name: str
    iso2: str | None = None
    iso3: str
    region: str | None = None
    capital: str | None = None
    population: int | None = None
    area_km2: float | None = None
    lat: float | None = None
    lon: float | None = None
    generated_at: datetime
    signal_summary: CountrySignalSummary
    historical_summary: CountryHistoricalSummary
    insight: CountryInsight
    recent_signals: List[CountrySignalItem]
    macro_metrics: List[CountryMacroMetric] = Field(default_factory=list)
    resilience_scorecard: CountryResilienceScorecard | None = None
    narrative: CountryNarrativeBlock | None = None
    source_attribution: List[SourceAttribution]
    license_tag: str


class FeedbackCreateRequest(BaseModel):
    location_id: str
    rating: int = Field(ge=1, le=5, default=3)
    comment: str | None = None
    correction: dict = Field(default_factory=dict)


class FeedbackItem(BaseModel):
    id: int
    location_id: str
    rating: int
    comment: str | None = None
    correction: dict
    created_at: datetime

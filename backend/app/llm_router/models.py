from __future__ import annotations

from datetime import datetime
from typing import List

from pydantic import BaseModel, Field


class Citation(BaseModel):
    source: str = Field(min_length=2, max_length=120)
    source_url: str
    timestamp_utc: datetime


class InsightPayload(BaseModel):
    summary: str = Field(min_length=20, max_length=2000)
    risk_rationale: str = Field(min_length=20, max_length=2000)
    recommendations: List[str] = Field(min_length=3, max_length=8)
    first_72h_action_plan: List[str] = Field(min_length=3, max_length=8)
    citations: List[Citation] = Field(min_length=1, max_length=20)


class InsightRequest(BaseModel):
    location_id: str
    location_name: str
    lang: str = "tr"
    risk_score: float
    primary_threat: str
    evidence: List[dict]


class DecisionMetadata(BaseModel):
    provider: str
    model: str
    fallback_used: bool
    prompt_version: str
    input_chars: int
    evidence_count: int
    output_tokens_estimate: int
    estimated_cost_usd: float
    error_chain: str | None = None

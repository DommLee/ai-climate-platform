from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app import models
from app.config import get_settings
from app.database import get_db

router = APIRouter(prefix="/governance", tags=["governance"])


@router.get("/model-decisions")
def model_decisions(
    location_id: str | None = None,
    limit: int = Query(50, ge=1, le=500),
    db: Session = Depends(get_db),
) -> dict:
    query = db.query(models.ModelDecision).order_by(models.ModelDecision.created_at.desc())
    if location_id:
        query = query.filter(models.ModelDecision.location_id == location_id)

    rows = query.limit(limit).all()
    return {
        "items": [
            {
                "id": row.id,
                "location_id": row.location_id,
                "insight_id": row.insight_id,
                "provider": row.provider,
                "model": row.model,
                "prompt_version": row.prompt_version,
                "fallback_used": row.fallback_used,
                "input_chars": row.input_chars,
                "evidence_count": row.evidence_count,
                "output_tokens_estimate": row.output_tokens_estimate,
                "estimated_cost_usd": row.estimated_cost_usd,
                "error_chain": row.error_chain,
                "created_at": row.created_at.isoformat(),
            }
            for row in rows
        ]
    }


@router.get("/model-versions")
def model_versions() -> dict:
    settings = get_settings()
    return {
        "prompt_version": settings.llm_prompt_version,
        "primary": {
            "provider": settings.llm_primary_provider,
            "model": settings.openai_model if settings.llm_primary_provider == "openai" else settings.gemini_model,
        },
        "secondary": {
            "provider": settings.llm_secondary_provider,
            "model": settings.openai_model if settings.llm_secondary_provider == "openai" else settings.gemini_model,
        },
    }


@router.get("/prompt-changelog")
def prompt_changelog() -> dict:
    path = Path(__file__).resolve().parents[3] / "prompt_changelog.md"
    if not path.exists():
        return {"content": "", "available": False}
    return {"content": path.read_text(encoding="utf-8"), "available": True}

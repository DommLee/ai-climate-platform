from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter

router = APIRouter(prefix="/compliance", tags=["compliance"])


@router.get("/checklist")
def checklist() -> dict:
    items = [
        {
            "id": "gdpr_data_minimization",
            "title": "GDPR data minimization",
            "status": "implemented",
            "evidence": "Only location-level climate metrics stored; no personal data fields.",
        },
        {
            "id": "ai_rmf_govern",
            "title": "NIST AI RMF governance",
            "status": "implemented",
            "evidence": "Model decisions, fallback, and prompt version are logged in model_decisions table.",
        },
        {
            "id": "eu_ai_act_readiness",
            "title": "EU AI Act readiness",
            "status": "partial",
            "evidence": "Risk explanations and citations are available; formal conformity workflow pending.",
        },
        {
            "id": "source_license_tracking",
            "title": "Source license tracking",
            "status": "implemented",
            "evidence": "Each source attribution includes license_tag and freshness metadata.",
        },
        {
            "id": "osm_tile_policy_cache",
            "title": "OSM tile policy with cache",
            "status": "implemented",
            "evidence": "Tile proxy endpoint stores cached tiles in tile_cache table.",
        },
    ]
    return {"generated_at": datetime.now(timezone.utc).isoformat(), "items": items}

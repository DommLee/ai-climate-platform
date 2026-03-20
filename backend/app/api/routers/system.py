from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter

from app.config import get_settings
from app.country_filters import EXCLUDED_COUNTRY_ISO3
from app.locations import list_locations
from app.schemas import SystemProviderStatus, SystemStatusResponse

router = APIRouter(tags=["system"])


@router.get("/system/status", response_model=SystemStatusResponse)
def get_system_status() -> SystemStatusResponse:
    settings = get_settings()
    providers = [
        SystemProviderStatus(
            provider="groq",
            configured=bool(settings.groq_api_key),
            model=settings.groq_model,
        ),
        SystemProviderStatus(
            provider="gemini",
            configured=bool(settings.gemini_api_key),
            model=settings.gemini_model,
        ),
        SystemProviderStatus(
            provider="openai",
            configured=bool(settings.openai_api_key),
            model=settings.openai_model,
        ),
    ]
    configured_count = sum(1 for item in providers if item.configured)
    mode = "LIVE" if configured_count else "LIVE_WITH_FALLBACK"
    return SystemStatusResponse(
        generated_at=datetime.now(timezone.utc),
        mode=mode,
        fallback_enabled=True,
        llm_primary_provider=settings.llm_primary_provider,
        llm_secondary_provider=settings.llm_secondary_provider,
        providers=providers,
        excluded_country_iso3=sorted(EXCLUDED_COUNTRY_ISO3),
        location_count=len(list_locations(core_only=False)),
    )

from fastapi import APIRouter

from app.api.routers import (
    compliance_router,
    countries_router,
    feedback_router,
    governance_router,
    health_router,
    locations_router,
    maps_router,
    observability_router,
    reports_router,
    sources_router,
)

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(health_router)
api_router.include_router(locations_router)
api_router.include_router(countries_router)
api_router.include_router(reports_router)
api_router.include_router(sources_router)
api_router.include_router(observability_router)
api_router.include_router(governance_router)
api_router.include_router(compliance_router)
api_router.include_router(maps_router)
api_router.include_router(feedback_router)

from app.api.routers.compliance import router as compliance_router
from app.api.routers.countries import router as countries_router
from app.api.routers.feedback import router as feedback_router
from app.api.routers.governance import router as governance_router
from app.api.routers.health import router as health_router
from app.api.routers.locations import router as locations_router
from app.api.routers.maps import router as maps_router
from app.api.routers.observability import router as observability_router
from app.api.routers.reports import router as reports_router
from app.api.routers.sources import router as sources_router

__all__ = [
    "health_router",
    "locations_router",
    "countries_router",
    "reports_router",
    "sources_router",
    "observability_router",
    "governance_router",
    "compliance_router",
    "maps_router",
    "feedback_router",
]

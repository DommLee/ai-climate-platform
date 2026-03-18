from __future__ import annotations

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.trustedhost import TrustedHostMiddleware

from app.api import api_router
from app.config import get_settings
from app.database import init_db
from app.ingestion.service import IngestionService
from app.middleware.metrics import MetricsMiddleware
from app.middleware.rate_limit import RateLimitMiddleware
from app.middleware.request_context import RequestContextMiddleware
from app.middleware.security_headers import SecurityHeadersMiddleware
from app.scheduler import SchedulerService

logger = logging.getLogger(__name__)

scheduler_service: SchedulerService | None = None


def create_app() -> FastAPI:
    settings = get_settings()

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )

    app = FastAPI(title=settings.app_name, version="1.0.0")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=False,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["*"],
    )
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=settings.trusted_hosts)
    app.add_middleware(RequestContextMiddleware)
    app.add_middleware(MetricsMiddleware)
    app.add_middleware(
        RateLimitMiddleware,
        window_seconds=settings.rate_limit_window_seconds,
        max_requests=settings.rate_limit_max_requests,
    )
    app.add_middleware(SecurityHeadersMiddleware)

    app.include_router(api_router)

    @app.get("/")
    def root() -> dict:
        return {
            "status": "ok",
            "service": settings.app_name,
            "docs": "/docs",
            "api_v1": "/api/v1",
        }

    @app.on_event("startup")
    def on_startup() -> None:
        global scheduler_service
        init_db()
        ingestion = IngestionService()
        from app.database import SessionLocal

        with SessionLocal() as db:
            ingestion.seed_locations(db)

        if settings.enable_scheduler_in_api:
            scheduler_service = SchedulerService()
            scheduler_service.start()
            logger.info("Embedded scheduler started")

    @app.on_event("shutdown")
    def on_shutdown() -> None:
        if scheduler_service:
            scheduler_service.stop()

    return app

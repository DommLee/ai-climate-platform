from __future__ import annotations

from functools import lru_cache

from app.ingestion.service import IngestionService
from app.llm_router import LLMRouter
from app.reporting import ReportService


@lru_cache(maxsize=1)
def get_ingestion_service() -> IngestionService:
    return IngestionService()


@lru_cache(maxsize=1)
def get_llm_router() -> LLMRouter:
    return LLMRouter()


@lru_cache(maxsize=1)
def get_report_service() -> ReportService:
    return ReportService()

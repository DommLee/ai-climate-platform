from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache
from typing import List

from app.secrets import resolve_secret


def _get_bool(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _get_int(name: str, default: int) -> int:
    value = os.getenv(name)
    if value is None:
        return default
    try:
        return int(value)
    except ValueError:
        return default


def _get_float(name: str, default: float) -> float:
    value = os.getenv(name)
    if value is None:
        return default
    try:
        return float(value)
    except ValueError:
        return default


def _get_list(name: str, default: List[str]) -> List[str]:
    value = os.getenv(name)
    if value is None:
        return default
    return [item.strip() for item in value.split(",") if item.strip()]


@dataclass(frozen=True)
class Settings:
    app_name: str
    app_env: str
    api_host: str
    api_port: int
    cors_origins: List[str]
    trusted_hosts: List[str]

    database_url: str
    redis_url: str

    ingest_interval_minutes: int
    ingest_core_locations_only: bool
    report_worker_poll_seconds: int
    data_freshness_minutes: int
    request_timeout_seconds: int

    openai_api_key: str
    openai_model: str
    gemini_api_key: str
    gemini_model: str
    llm_primary_provider: str
    llm_secondary_provider: str
    llm_timeout_seconds: int
    llm_max_input_chars: int
    llm_max_output_tokens: int
    llm_prompt_version: str
    llm_token_cost_input_per_1k: float
    llm_token_cost_output_per_1k: float
    llm_max_cost_usd_per_call: float

    allowlist_domains: List[str]
    secret_manager_mode: str

    report_output_dir: str
    enable_scheduler_in_api: bool

    rate_limit_window_seconds: int
    rate_limit_max_requests: int
    max_event_records_per_source: int
    emdat_api_url: str
    emdat_api_key: str
    copernicus_api_url: str
    copernicus_api_key: str


def build_settings() -> Settings:
    secret_manager_mode = os.getenv("SECRET_MANAGER_MODE", "env")
    return Settings(
        app_name=os.getenv("APP_NAME", "AI Climate Platform API"),
        app_env=os.getenv("APP_ENV", "development"),
        api_host=os.getenv("API_HOST", "0.0.0.0"),
        api_port=_get_int("API_PORT", 8000),
        cors_origins=_get_list(
            "CORS_ORIGINS",
            [
                "http://localhost:5173",
                "http://localhost:4173",
                "https://dommlee.github.io",
            ],
        ),
        trusted_hosts=_get_list("TRUSTED_HOSTS", ["localhost", "127.0.0.1", "api", "*"]),
        database_url=os.getenv("DATABASE_URL", "sqlite:///./climate.db"),
        redis_url=os.getenv("REDIS_URL", "redis://redis:6379/0"),
        ingest_interval_minutes=_get_int("INGEST_INTERVAL_MINUTES", 15),
        ingest_core_locations_only=_get_bool("INGEST_CORE_LOCATIONS_ONLY", True),
        report_worker_poll_seconds=_get_int("REPORT_WORKER_POLL_SECONDS", 5),
        data_freshness_minutes=_get_int("DATA_FRESHNESS_MINUTES", 90),
        request_timeout_seconds=_get_int("REQUEST_TIMEOUT_SECONDS", 20),
        openai_api_key=resolve_secret("OPENAI_API_KEY", "", mode=secret_manager_mode),
        openai_model=os.getenv("OPENAI_MODEL", "gpt-4.1-mini"),
        gemini_api_key=resolve_secret("GEMINI_API_KEY", "", mode=secret_manager_mode),
        gemini_model=os.getenv("GEMINI_MODEL", "gemini-1.5-flash"),
        llm_primary_provider=os.getenv("LLM_PRIMARY_PROVIDER", "openai"),
        llm_secondary_provider=os.getenv("LLM_SECONDARY_PROVIDER", "gemini"),
        llm_timeout_seconds=_get_int("LLM_TIMEOUT_SECONDS", 25),
        llm_max_input_chars=_get_int("LLM_MAX_INPUT_CHARS", 14000),
        llm_max_output_tokens=_get_int("LLM_MAX_OUTPUT_TOKENS", 900),
        llm_prompt_version=os.getenv("LLM_PROMPT_VERSION", "v1"),
        llm_token_cost_input_per_1k=_get_float("LLM_TOKEN_COST_INPUT_PER_1K", 0.003),
        llm_token_cost_output_per_1k=_get_float("LLM_TOKEN_COST_OUTPUT_PER_1K", 0.015),
        llm_max_cost_usd_per_call=_get_float("LLM_MAX_COST_USD_PER_CALL", 0.35),
        allowlist_domains=_get_list(
            "ALLOWLIST_DOMAINS",
            [
                "open-meteo.com",
                "power.larc.nasa.gov",
                "cds.climate.copernicus.eu",
                "docs.openaq.org",
                "openaq.org",
                "apidoc.reliefweb.int",
                "reliefweb.int",
                "gdeltproject.org",
                "news.google.com",
                "undrr.org",
                "emdat.be",
                "worldbank.org",
                "api.worldbank.org",
                "ourworldindata.org",
            ],
        ),
        secret_manager_mode=secret_manager_mode,
        report_output_dir=os.getenv("REPORT_OUTPUT_DIR", "./reports"),
        enable_scheduler_in_api=_get_bool("ENABLE_SCHEDULER_IN_API", False),
        rate_limit_window_seconds=_get_int("RATE_LIMIT_WINDOW_SECONDS", 60),
        rate_limit_max_requests=_get_int("RATE_LIMIT_MAX_REQUESTS", 120),
        max_event_records_per_source=_get_int("MAX_EVENT_RECORDS_PER_SOURCE", 25),
        emdat_api_url=os.getenv("EMDAT_API_URL", ""),
        emdat_api_key=resolve_secret("EMDAT_API_KEY", "", mode=secret_manager_mode),
        copernicus_api_url=os.getenv("COPERNICUS_API_URL", ""),
        copernicus_api_key=resolve_secret("COPERNICUS_API_KEY", "", mode=secret_manager_mode),
    )


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return build_settings()

from __future__ import annotations

from prometheus_client import CONTENT_TYPE_LATEST, Counter, Histogram, REGISTRY, generate_latest


def _counter(name: str, doc: str, labels: tuple[str, ...] = ()) -> Counter:
    existing = REGISTRY._names_to_collectors.get(name)  # type: ignore[attr-defined]
    if existing is not None:
        return existing  # type: ignore[return-value]
    return Counter(name, doc, labels)


def _histogram(name: str, doc: str, labels: tuple[str, ...] = ()) -> Histogram:
    existing = REGISTRY._names_to_collectors.get(name)  # type: ignore[attr-defined]
    if existing is not None:
        return existing  # type: ignore[return-value]
    return Histogram(name, doc, labels)


REQUEST_COUNT = _counter("climate_api_requests_total", "API request count", ("method", "path", "status"))
REQUEST_LATENCY = _histogram("climate_api_request_latency_seconds", "API request latency", ("method", "path"))
INGEST_RUN_COUNT = _counter("climate_ingest_runs_total", "Ingestion runs", ("status",))
LLM_DECISION_COUNT = _counter("climate_llm_decisions_total", "LLM routing decisions", ("provider", "fallback"))
REPORT_JOB_COUNT = _counter("climate_report_jobs_total", "Report jobs", ("status",))


def render_metrics() -> tuple[bytes, str]:
    payload = generate_latest()
    return payload, CONTENT_TYPE_LATEST

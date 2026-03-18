from app.llm_router.models import InsightRequest
from app.llm_router.router import LLMRouter


def test_llm_router_fallback_returns_valid_payload() -> None:
    router = LLMRouter()
    payload, decision = router.generate_insight(
        InsightRequest(
            location_id="istanbul",
            location_name="Istanbul",
            lang="en",
            risk_score=72.5,
            primary_threat="heatwave",
            evidence=[
                {
                    "source": "open_meteo",
                    "source_url": "https://open-meteo.com/",
                    "title": "Forecast",
                    "summary": "High temperature trend",
                    "timestamp_utc": "2026-01-01T00:00:00Z",
                }
            ],
        )
    )

    assert payload.summary
    assert len(payload.recommendations) >= 3
    assert payload.citations
    assert decision.provider in {"openai", "gemini", "fallback"}
    assert isinstance(decision.fallback_used, bool)


def test_llm_router_cost_guardrail_forces_fallback(monkeypatch) -> None:
    router = LLMRouter()
    monkeypatch.setattr(router, "_estimate_cost_usd", lambda input_chars, output_tokens_estimate: 999.0)

    payload, decision = router.generate_insight(
        InsightRequest(
            location_id="london",
            location_name="London",
            lang="en",
            risk_score=63.2,
            primary_threat="flood",
            evidence=[
                {
                    "source": "open_meteo",
                    "source_url": "https://open-meteo.com/",
                    "title": "Forecast",
                    "summary": "Persistent precipitation and flood signal.",
                    "timestamp_utc": "2026-01-01T00:00:00Z",
                }
            ],
        )
    )

    assert payload.summary
    assert decision.provider == "fallback"
    assert decision.fallback_used is True
    assert "cost_limit:" in (decision.error_chain or "")

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Tuple

from app.config import get_settings
from app.llm_router.models import DecisionMetadata, InsightPayload, InsightRequest
from app.llm_router.providers import call_gemini, call_groq, call_openai
from app.llm_router.sanitization import extract_json_blob, sanitize_evidence, truncate_text


class LLMRouter:
    def __init__(self) -> None:
        self.settings = get_settings()

    def generate_insight(self, request: InsightRequest) -> Tuple[InsightPayload, DecisionMetadata]:
        sanitized_evidence = sanitize_evidence(
            evidence=request.evidence,
            allowlist_domains=self.settings.allowlist_domains,
            max_chars=self.settings.llm_max_input_chars,
        )

        system_prompt = (
            "You are a climate risk analyst. Produce strictly valid JSON only. "
            "Always include citations from provided evidence."
        )

        errors = []
        try:
            prompt, sanitized_evidence = self._fit_prompt(request, sanitized_evidence)
        except Exception as exc:
            errors.append(f"prompt_builder:{exc}")
            fallback = self._fallback_payload(request, sanitized_evidence)
            output_tokens_estimate = max(1, len(fallback.summary) // 4)
            metadata = DecisionMetadata(
                provider="fallback",
                model="deterministic",
                fallback_used=True,
                prompt_version=self.settings.llm_prompt_version,
                input_chars=0,
                evidence_count=len(sanitized_evidence),
                output_tokens_estimate=output_tokens_estimate,
                estimated_cost_usd=0.0,
                error_chain=" | ".join(errors),
            )
            return fallback, metadata

        providers = [self.settings.llm_primary_provider, self.settings.llm_secondary_provider]
        input_chars = len(prompt)
        evidence_count = len(sanitized_evidence)
        max_estimated_cost = self._estimate_cost_usd(input_chars, self.settings.llm_max_output_tokens)
        if max_estimated_cost > self.settings.llm_max_cost_usd_per_call:
            errors.append(
                f"cost_limit:estimated={max_estimated_cost:.4f}>limit={self.settings.llm_max_cost_usd_per_call:.4f}"
            )
        for provider in providers:
            try:
                if errors and errors[-1].startswith("cost_limit:"):
                    raise RuntimeError(errors[-1])
                text = self._call_provider(provider, prompt, system_prompt)
                payload = self._validate_payload(text)
                model_name = self._model_for(provider)
                output_tokens_estimate = max(1, len(text) // 4)
                estimated_cost = self._estimate_cost_usd(input_chars, output_tokens_estimate)
                metadata = DecisionMetadata(
                    provider=provider,
                    model=model_name,
                    fallback_used=False,
                    prompt_version=self.settings.llm_prompt_version,
                    input_chars=input_chars,
                    evidence_count=evidence_count,
                    output_tokens_estimate=output_tokens_estimate,
                    estimated_cost_usd=estimated_cost,
                    error_chain=" | ".join(errors) if errors else None,
                )
                return payload, metadata
            except Exception as exc:
                errors.append(f"{provider}:{exc}")

        fallback = self._fallback_payload(request, sanitized_evidence)
        output_tokens_estimate = max(1, len(fallback.summary) // 4)
        metadata = DecisionMetadata(
            provider="fallback",
            model="deterministic",
            fallback_used=True,
            prompt_version=self.settings.llm_prompt_version,
            input_chars=input_chars,
            evidence_count=evidence_count,
            output_tokens_estimate=output_tokens_estimate,
            estimated_cost_usd=0.0,
            error_chain=" | ".join(errors) if errors else "all providers failed",
        )
        return fallback, metadata

    def _fit_prompt(self, request: InsightRequest, evidence: list[dict]) -> tuple[str, list[dict]]:
        if not evidence:
            prompt = self._build_prompt(request, [])
            if len(prompt) > self.settings.llm_max_input_chars:
                raise RuntimeError("prompt_over_limit_with_empty_evidence")
            return prompt, []

        selected = evidence[:]
        prompt = self._build_prompt(request, selected)
        while len(prompt) > self.settings.llm_max_input_chars and len(selected) > 1:
            selected = selected[:-1]
            prompt = self._build_prompt(request, selected)

        if len(prompt) <= self.settings.llm_max_input_chars:
            return prompt, selected

        compact = []
        for item in selected:
            compact.append(
                {
                    "source": item.get("source", ""),
                    "source_url": item.get("source_url", ""),
                    "title": truncate_text(str(item.get("title", "")), 80),
                    "summary": truncate_text(str(item.get("summary", "")), 180),
                    "timestamp_utc": item.get("timestamp_utc", ""),
                }
            )
        prompt = self._build_prompt(request, compact)
        if len(prompt) > self.settings.llm_max_input_chars:
            raise RuntimeError("prompt_over_limit")
        return prompt, compact

    def _call_provider(self, provider: str, prompt: str, system_prompt: str) -> str:
        provider = provider.lower().strip()
        if provider == "openai":
            return call_openai(self.settings, prompt, system_prompt)
        if provider == "gemini":
            return call_gemini(self.settings, prompt, system_prompt)
        if provider == "groq":
            return call_groq(self.settings, prompt, system_prompt)
        raise RuntimeError(f"Unsupported provider: {provider}")

    def _model_for(self, provider: str) -> str:
        provider = provider.lower().strip()
        if provider == "openai":
            return self.settings.openai_model
        if provider == "gemini":
            return self.settings.gemini_model
        if provider == "groq":
            return self.settings.groq_model
        return "unknown"

    def _validate_payload(self, raw_text: str) -> InsightPayload:
        blob = extract_json_blob(raw_text)
        parsed = json.loads(blob)
        payload = InsightPayload.model_validate(parsed)
        return payload

    def _build_prompt(self, request: InsightRequest, evidence: list[dict]) -> str:
        schema_example = {
            "summary": "",
            "risk_rationale": "",
            "recommendations": ["", "", ""],
            "first_72h_action_plan": ["", "", ""],
            "citations": [
                {
                    "source": "",
                    "source_url": "",
                    "timestamp_utc": "2026-01-01T00:00:00Z",
                }
            ],
        }

        payload = {
            "task": "Generate climate risk insight",
            "prompt_version": self.settings.llm_prompt_version,
            "lang": request.lang,
            "location": request.location_name,
            "location_id": request.location_id,
            "risk_score": request.risk_score,
            "primary_threat": request.primary_threat,
            "output_contract": schema_example,
            "rules": [
                "Return JSON only, no markdown",
                "Minimum 3 recommendations",
                "All citations must be from provided evidence",
                "Do not invent sources",
            ],
            "evidence": evidence,
        }
        return json.dumps(payload, ensure_ascii=False)

    def _estimate_cost_usd(self, input_chars: int, output_tokens_estimate: int) -> float:
        approx_input_tokens = max(1, input_chars // 4)
        input_cost = (approx_input_tokens / 1000.0) * self.settings.llm_token_cost_input_per_1k
        output_cost = (output_tokens_estimate / 1000.0) * self.settings.llm_token_cost_output_per_1k
        return round(input_cost + output_cost, 6)

    def _fallback_payload(self, request: InsightRequest, evidence: list[dict]) -> InsightPayload:
        if request.lang == "en":
            summary = (
                f"Current risk score for {request.location_name} is {request.risk_score:.1f}/100 and the primary threat is "
                f"{request.primary_threat}."
            )
            rationale = (
                "The deterministic risk engine combines temperature, precipitation likelihood, air quality, and recent event "
                "signals to generate this result."
            )
            recommendations = [
                "Update local early-warning protocols with the 15-minute data refresh cycle.",
                "Reserve water, energy, and health capacity for a 72-hour disruption scenario.",
                "Run targeted communications and field checklists in high-risk districts.",
            ]
            action_plan = [
                "0-24h: Increase monitoring frequency in critical zones and confirm emergency rosters.",
                "24-48h: Complete operational resource allocation for vulnerable neighborhoods.",
                "48-72h: Recompute risk with fresh signals and revise response priorities.",
            ]
        else:
            summary = (
                f"{request.location_name} icin mevcut risk skoru {request.risk_score:.1f}/100 ve ana tehdit "
                f"{request.primary_threat} olarak gorunuyor."
            )
            rationale = (
                "Deterministik risk motoru; sicaklik, yagis olasiligi, hava kalitesi ve son olay sinyallerini "
                "birlikte degerlendirerek bu sonucu uretmistir."
            )
            recommendations = [
                "Yerel erken uyari protokollerini 15 dakikalik veri dongusu ile guncelle.",
                "Su, enerji ve saglik altyapisinda 72 saatlik kesinti senaryosuna gore kaynak rezerve et.",
                "Saha ekipleri icin risk bolgelerinde hedefli iletisim ve kontrol listesi uygula.",
            ]
            action_plan = [
                "0-24 saat: Kritik bolgelerde izleme sikligini artir ve acil durum ekiplerini teyit et.",
                "24-48 saat: Riskli mahalleler icin operasyonel kaynak dagitimini tamamlama.",
                "48-72 saat: Yeni sinyallere gore risk skorunu tekrar hesaplayip eylem planini revize et.",
            ]

        citations = []
        for item in evidence[:5]:
            if not item.get("source_url"):
                continue
            try:
                citations.append(
                    {
                        "source": item.get("source", "source"),
                        "source_url": item.get("source_url"),
                        "timestamp_utc": item.get("timestamp_utc") or datetime.now(timezone.utc).isoformat(),
                    }
                )
            except Exception:
                continue

        if not citations:
            citations = [
                {
                    "source": "internal_risk_engine",
                    "source_url": "https://open-meteo.com/",
                    "timestamp_utc": datetime.now(timezone.utc).isoformat(),
                }
            ]

        return InsightPayload.model_validate(
            {
                "summary": truncate_text(summary, 1900),
                "risk_rationale": truncate_text(rationale, 1900),
                "recommendations": recommendations,
                "first_72h_action_plan": action_plan,
                "citations": citations,
            }
        )

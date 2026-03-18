from __future__ import annotations

import json
from typing import Any

import requests

from app.config import Settings


def call_openai(settings: Settings, prompt: str, system_prompt: str) -> str:
    if not settings.openai_api_key:
        raise RuntimeError("OPENAI_API_KEY is missing")

    url = "https://api.openai.com/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {settings.openai_api_key}",
        "Content-Type": "application/json",
    }
    payload: dict[str, Any] = {
        "model": settings.openai_model,
        "temperature": 0.2,
        "max_tokens": settings.llm_max_output_tokens,
        "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": prompt},
        ],
    }

    response = requests.post(url, headers=headers, json=payload, timeout=settings.llm_timeout_seconds)
    if response.status_code >= 400:
        raise RuntimeError(f"OpenAI call failed: {response.status_code} {response.text[:400]}")

    data = response.json()
    choices = data.get("choices", [])
    if not choices:
        raise RuntimeError("OpenAI response has no choices")
    content = choices[0].get("message", {}).get("content")
    if not content:
        raise RuntimeError("OpenAI response content is empty")
    return str(content)


def call_gemini(settings: Settings, prompt: str, system_prompt: str) -> str:
    if not settings.gemini_api_key:
        raise RuntimeError("GEMINI_API_KEY is missing")

    url = f"https://generativelanguage.googleapis.com/v1beta/models/{settings.gemini_model}:generateContent"
    params = {"key": settings.gemini_api_key}

    payload = {
        "system_instruction": {"parts": [{"text": system_prompt}]},
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": 0.2,
            "maxOutputTokens": settings.llm_max_output_tokens,
            "responseMimeType": "application/json",
        },
    }

    response = requests.post(url, params=params, json=payload, timeout=settings.llm_timeout_seconds)
    if response.status_code >= 400:
        raise RuntimeError(f"Gemini call failed: {response.status_code} {response.text[:400]}")

    data = response.json()
    candidates = data.get("candidates", [])
    if not candidates:
        raise RuntimeError("Gemini response has no candidates")
    parts = candidates[0].get("content", {}).get("parts", [])
    if not parts:
        raise RuntimeError("Gemini content parts are empty")
    text = parts[0].get("text")
    if not text:
        raise RuntimeError("Gemini text output is empty")
    return str(text)

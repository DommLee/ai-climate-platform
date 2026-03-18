# AI Climate Platform (Global v1)

This repository contains a global AI-powered climate risk platform.

## Stack
- Backend: FastAPI + SQLAlchemy + APScheduler + ReportLab
- Frontend: React + Vite + Recharts + Tailwind CSS
- Runtime: Docker Compose (api, worker, postgres, redis, frontend)

## Key API Endpoints
- `GET /api/v1/locations`
- `GET /api/v1/locations/rankings?limit=`
- `GET /api/v1/locations/{id}/snapshot`
- `GET /api/v1/locations/{id}/timeseries?metric=&from=&to=`
- `GET /api/v1/locations/{id}/risks`
- `GET /api/v1/locations/{id}/risk-features`
- `GET /api/v1/locations/{id}/events`
- `GET /api/v1/locations/{id}/insights?lang=tr|en`
- `POST /api/v1/reports`
- `GET /api/v1/reports/{report_id}`
- `GET /api/v1/reports/{report_id}/file`
- `GET /api/v1/sources`
- `GET /api/v1/metrics`
- `GET /api/v1/compliance/checklist`
- `GET /api/v1/governance/model-decisions`
- `GET /api/v1/maps/geocode?query=...`
- `GET /api/v1/maps/tile/{z}/{x}/{y}.png`
- `GET /api/v1/countries/{country_code}/profile?lang=tr|en&days=90`
- `POST /api/v1/feedback`
- `GET /api/v1/feedback`
- `GET /api/v1/health/alerts`

`/api/v1/countries/{country_code}/profile` response now includes:
- `signal_summary` (current risk signal score)
- `historical_summary` (trend direction, top threats, timeline buckets)
- `insight` (citation-based AI explanation + recommendations)
- `macro_metrics` (World Bank country indicators with world benchmark delta)
- `resilience_scorecard` (overall resilience, adaptation readiness, climate pressure)
- `narrative` (executive brief, climate context, sustainability context, 30/90 day playbook)

## Local Run
1. Set API keys as environment variables if needed:
   - `OPENAI_API_KEY`
   - `GEMINI_API_KEY`
   - Optional secret binding:
     - `OPENAI_API_KEY_SECRET_NAME=YOUR_ENV_VAR_NAME`
     - `GEMINI_API_KEY_SECRET_NAME=YOUR_ENV_VAR_NAME`
2. Start stack:
   - `docker compose up --build -d`
3. Open:
   - Frontend: `http://localhost:5180`
   - API docs: `http://localhost:8000/docs`
   - 3D World Explorer: `http://localhost:5180/world`
   - Country Compare: `http://localhost:5180/compare`

## Notes
- Worker performs scheduled ingestion every 15 minutes.
- Scheduler can be limited to core cities via `INGEST_CORE_LOCATIONS_ONLY=true` for production safety.
- API includes rate limiting and security headers.
- If both LLM providers fail, deterministic fallback insight is returned.
- LLM router enforces prompt size and per-call cost guardrail.
- This setup is configured for non-commercial mode by default.
- Model routing decisions are logged for governance/audit.
- OSM tile traffic is proxied through a backend cache endpoint.
- Risk payloads include source attribution, freshness, and trust score metadata.
- Location selector now supports city search and expanded global catalog (100+ cities).

## GitHub Publish (DommLee)
- Follow [DEPLOYMENT.md](./DEPLOYMENT.md) for secure push and production rollout.
- Quick Windows publish helper: `publish-github.bat`
- Keep `.env` files private; only `.env.example` should be in Git.
- This repo includes:
  - CI workflow: `.github/workflows/ci.yml`
  - Dependabot updates: `.github/dependabot.yml`
  - Security policy: `SECURITY.md`

## Production Safety Defaults
- `frontend/nginx.conf` disables cache for `index.html` and uses immutable cache for hashed assets.
- `baslat.bat` opens `http://localhost:5180` with cache-busting query to avoid stale bundles.

## Product Depth (Global Intelligence)
- Multi-source climate intelligence: Open-Meteo, NASA POWER, Copernicus ERA5, OpenAQ, ReliefWeb, GDELT, EM-DAT, World Bank indicators.
- Country page is not only a map click result; it provides evidence-backed long-form context and operational action tracks.
- Every country profile includes benchmarked sustainability indicators to avoid shallow, single-score interpretation.
- Resilience scorecard is explainable and deterministic, so platform remains useful even when LLM providers are unavailable.

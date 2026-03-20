# GitHub and Production Publish Guide

## 1) Push to GitHub (`DommLee`)

Fastest path on Windows:

```bat
publish-github.bat
```

This script:
- sets local git identity,
- switches branch to `main`,
- commits staged changes,
- configures `origin` as `https://github.com/<user>/<repo>.git`,
- pushes `main`.

If repository does not exist yet, create it first on GitHub as an empty repo (for example `DommLee/ai-climate-platform`).

Manual path (if you prefer):

```bash
git config user.name "DommLee"
git config user.email "YOUR_GITHUB_EMAIL"
git branch -M main
git add .
git commit -m "feat: global ai climate platform v1"
git remote add origin https://github.com/DommLee/ai-climate-platform.git
git push -u origin main
```

## 2) Signature / Commit Security

Recommended:

```bash
git config --global commit.gpgsign true
git config --global tag.gpgSign true
```

Then add your GPG or SSH signing key in GitHub settings so commits show as `Verified`.

## 3) GitHub Repository Security Baseline

- Enable branch protection on `main`.
- Require pull request and passing CI checks.
- Enable secret scanning + push protection.
- Enable Dependabot alerts + security updates.
- Enable code scanning (CodeQL) if available.
- Require signed commits if your team can support it.

## 4) Publish Like a Real Site (Recommended Architecture)

- Frontend: Vercel (or Netlify/Cloudflare Pages)
- Backend API: Render / Railway / Fly.io
- Database: Managed Postgres
- Cache/Queue: Managed Redis
- DNS: Cloudflare
- TLS: automatic via platform certificates

Single-domain pattern:
- `app.yourdomain.com` -> frontend
- `api.yourdomain.com` -> backend

### Render Quick Start (This Repo)

This repository now includes `render.yaml` with:
- `ai-climate-api` (FastAPI web service)
- `ai-climate-worker` (ingest + report background worker)

Steps:
1. Render -> New -> Blueprint -> select this GitHub repo.
2. Set shared env vars for both services:
   - `DATABASE_URL` (same Postgres connection for web + worker)
   - `GROQ_API_KEY`, `GEMINI_API_KEY` (optional fallback/tertiary: `OPENAI_API_KEY`)
   - optional: `EMDAT_API_KEY`, `COPERNICUS_API_KEY`
3. Deploy and verify backend:
   - `https://<your-api>.onrender.com/api/v1/health`
4. In GitHub repo settings, set `VITE_API_BASE_URL=https://<your-api>.onrender.com`.
5. Push to `main` (or rerun Pages workflow) to update frontend.

## 5) Docker VPS Path (Alternative)

1. Provision Linux VM (minimum 2 vCPU / 4GB RAM).
2. Install Docker + Docker Compose.
3. Clone repo and create real `.env` values (never commit secrets).
4. Configure reverse proxy (Caddy or Nginx) with TLS.
5. Start stack:

```bash
docker compose up --build -d
```

## 6) Production Hardening Checklist

- Store `GROQ_API_KEY`, `GEMINI_API_KEY`, and `OPENAI_API_KEY` only in secret manager.
- Restrict CORS and trusted hosts to your real domains.
- Keep `HTTPS only` and secure headers enabled.
- Enable backup policy for Postgres and Redis.
- Confirm health endpoints and critical API flows.
- Set error alerts for ingest failures and LLM failover spikes.
- Run rate-limit and load tests before public announcement.

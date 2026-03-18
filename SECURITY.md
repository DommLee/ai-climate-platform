# Security Policy

## Supported Versions
This repository currently supports the latest `main` branch for security updates.

## Reporting a Vulnerability
- Do not open public issues for critical vulnerabilities.
- Send details privately to the project maintainer first.
- Include:
  - affected endpoint/component
  - reproduction steps
  - impact assessment
  - suggested mitigation (if available)

## Security Baseline Used in This Project
- API keys are environment-based and must never be committed.
- `.env.example` is safe to commit; real `.env` files are ignored.
- Request rate limits and trusted host controls are enabled.
- Source attribution and citation metadata are preserved in outputs.
- LLM calls use guardrails (timeouts, cost limits, fallback path).

## Pre-Publish Checklist
- Verify no secrets are present in history or working tree.
- Rotate any keys that were previously exposed.
- Enable branch protection on `main`.
- Enable Dependabot and code scanning in GitHub repository settings.

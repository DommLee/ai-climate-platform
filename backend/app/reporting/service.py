from __future__ import annotations

import os
from datetime import datetime, timezone
from pathlib import Path

from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from sqlalchemy.orm import Session

from app import models
from app.config import get_settings
from app.observability import REPORT_JOB_COUNT


class ReportService:
    def __init__(self) -> None:
        self.settings = get_settings()
        Path(self.settings.report_output_dir).mkdir(parents=True, exist_ok=True)

    def create_job(self, db: Session, location_id: str, lang: str) -> models.ReportJob:
        job = models.ReportJob(location_id=location_id, lang=lang, status="pending")
        db.add(job)
        db.commit()
        db.refresh(job)
        REPORT_JOB_COUNT.labels(status="pending").inc()
        return job

    def process_pending_jobs(self, db: Session, max_jobs: int = 2) -> int:
        jobs = (
            db.query(models.ReportJob)
            .filter(models.ReportJob.status == "pending")
            .order_by(models.ReportJob.created_at.asc())
            .limit(max_jobs)
            .all()
        )
        processed = 0
        for job in jobs:
            processed += 1
            self._process_single_job(db, job)
        return processed

    def _process_single_job(self, db: Session, job: models.ReportJob) -> None:
        job.status = "processing"
        job.updated_at = datetime.now(timezone.utc)
        db.commit()

        try:
            location = db.query(models.Location).filter(models.Location.id == job.location_id).first()
            risk = (
                db.query(models.RiskSnapshot)
                .filter(models.RiskSnapshot.location_id == job.location_id)
                .order_by(models.RiskSnapshot.generated_at.desc())
                .first()
            )
            insight = (
                db.query(models.Insight)
                .filter(models.Insight.location_id == job.location_id)
                .filter(models.Insight.lang == job.lang)
                .order_by(models.Insight.generated_at.desc())
                .first()
            )

            if not location or not risk:
                raise RuntimeError("Missing location or risk data for report generation")

            filename = f"report_{job.id}.pdf"
            output_path = str(Path(self.settings.report_output_dir) / filename)
            self._generate_pdf(output_path, location, risk, insight)

            job.status = "completed"
            job.output_path = output_path
            job.error_message = None
            job.updated_at = datetime.now(timezone.utc)
            db.commit()
            REPORT_JOB_COUNT.labels(status="completed").inc()
        except Exception as exc:
            job.status = "failed"
            job.error_message = str(exc)
            job.updated_at = datetime.now(timezone.utc)
            db.commit()
            REPORT_JOB_COUNT.labels(status="failed").inc()

    def _generate_pdf(self, path: str, location: models.Location, risk: models.RiskSnapshot, insight: models.Insight | None) -> None:
        c = canvas.Canvas(path, pagesize=A4)
        width, height = A4

        y = height - 50
        line_gap = 16

        def draw_line(text: str, bold: bool = False) -> None:
            nonlocal y
            c.setFont("Helvetica-Bold" if bold else "Helvetica", 11)
            c.drawString(45, y, text[:120])
            y -= line_gap
            if y < 60:
                c.showPage()
                y = height - 50

        draw_line("AI Climate Platform - Executive Climate Report", bold=True)
        draw_line(f"Generated at (UTC): {datetime.now(timezone.utc).isoformat()}")
        draw_line(f"Location: {location.name} ({location.id})")
        draw_line("")

        draw_line("Risk Matrix", bold=True)
        draw_line(f"Overall Risk Score: {risk.overall_score:.2f}/100")
        draw_line(f"Hazard: {risk.hazard_score:.2f} | Exposure: {risk.exposure_score:.2f} | Vulnerability: {risk.vulnerability_score:.2f}")
        draw_line(f"Primary Threat: {risk.primary_threat}")
        draw_line(f"30-day Probability: {risk.probability_30d:.2f}%")
        draw_line(f"Confidence: {risk.confidence:.2f}% | Uncertainty: [{risk.uncertainty_low:.2f}, {risk.uncertainty_high:.2f}]")

        draw_line("")
        draw_line("First 72h Action Plan", bold=True)
        actions = [
            "0-24h: Trigger local alert protocol for critical zones and verify incident command roster.",
            "24-48h: Allocate emergency water, energy, and health resources by vulnerability map.",
            "48-72h: Recompute risk with fresh data and update tactical response priorities.",
        ]
        for idx, action in enumerate(actions, start=1):
            draw_line(f"{idx}. {action}")

        draw_line("")
        draw_line("Analyst Summary", bold=True)
        if insight and isinstance(insight.content_json, dict):
            draw_line(str(insight.content_json.get("summary", "No summary")))
            draw_line(str(insight.content_json.get("risk_rationale", "No rationale")))
        else:
            draw_line("Insight not available; deterministic risk assessment used.")

        draw_line("")
        draw_line("Sources", bold=True)
        attributions = risk.source_attribution_json if isinstance(risk.source_attribution_json, list) else []
        for src in attributions[:12]:
            source = str(src.get("source", "source"))
            source_url = str(src.get("source_url", ""))
            draw_line(f"- {source}: {source_url}")

        c.save()

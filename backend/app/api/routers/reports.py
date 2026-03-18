from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app import models
from app.api.deps import get_report_service
from app.database import get_db
from app.reporting.service import ReportService
from app.schemas import ReportCreateRequest, ReportResponse

router = APIRouter(prefix="/reports", tags=["reports"])


@router.post("", response_model=ReportResponse)
def create_report(
    payload: ReportCreateRequest,
    db: Session = Depends(get_db),
    report_service: ReportService = Depends(get_report_service),
) -> ReportResponse:
    location = db.query(models.Location).filter(models.Location.id == payload.location_id).first()
    if not location:
        raise HTTPException(status_code=404, detail="Unknown location_id")

    job = report_service.create_job(db, payload.location_id, payload.lang)
    return ReportResponse(
        id=job.id,
        location_id=job.location_id,
        lang=job.lang,
        status=job.status,
        created_at=job.created_at,
        updated_at=job.updated_at,
        output_url=None,
        duration_seconds=None,
        error_message=job.error_message,
    )


@router.get("/{report_id}", response_model=ReportResponse)
def get_report(report_id: str, db: Session = Depends(get_db)) -> ReportResponse:
    job = db.query(models.ReportJob).filter(models.ReportJob.id == report_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Report job not found")

    output_url = f"/api/v1/reports/{job.id}/file" if job.output_path and Path(job.output_path).exists() else None
    duration_seconds = None
    if job.created_at and job.updated_at:
        duration_seconds = max(0.0, (job.updated_at - job.created_at).total_seconds())

    return ReportResponse(
        id=job.id,
        location_id=job.location_id,
        lang=job.lang,
        status=job.status,
        created_at=job.created_at,
        updated_at=job.updated_at,
        output_url=output_url,
        duration_seconds=duration_seconds,
        error_message=job.error_message,
    )


@router.get("/{report_id}/file")
def download_report(report_id: str, db: Session = Depends(get_db)) -> FileResponse:
    job = db.query(models.ReportJob).filter(models.ReportJob.id == report_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Report job not found")
    if not job.output_path:
        raise HTTPException(status_code=409, detail="Report is not ready")

    path = Path(job.output_path)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Report file missing")

    return FileResponse(path=path, filename=path.name, media_type="application/pdf")

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app import models
from app.database import get_db
from app.schemas import FeedbackCreateRequest, FeedbackItem

router = APIRouter(prefix="/feedback", tags=["feedback"])


@router.post("", response_model=FeedbackItem)
def create_feedback(payload: FeedbackCreateRequest, db: Session = Depends(get_db)) -> FeedbackItem:
    location = db.query(models.Location).filter(models.Location.id == payload.location_id).first()
    if not location:
        raise HTTPException(status_code=404, detail="Unknown location_id")

    row = models.UserFeedback(
        location_id=payload.location_id,
        rating=payload.rating,
        comment=payload.comment,
        correction_json=payload.correction,
    )
    db.add(row)
    db.commit()
    db.refresh(row)

    return FeedbackItem(
        id=row.id,
        location_id=row.location_id,
        rating=row.rating,
        comment=row.comment,
        correction=row.correction_json,
        created_at=row.created_at,
    )


@router.get("", response_model=list[FeedbackItem])
def list_feedback(
    location_id: str | None = Query(None),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
) -> list[FeedbackItem]:
    query = db.query(models.UserFeedback).order_by(models.UserFeedback.created_at.desc())
    if location_id:
        query = query.filter(models.UserFeedback.location_id == location_id)

    rows = query.limit(limit).all()
    return [
        FeedbackItem(
            id=row.id,
            location_id=row.location_id,
            rating=row.rating,
            comment=row.comment,
            correction=row.correction_json,
            created_at=row.created_at,
        )
        for row in rows
    ]

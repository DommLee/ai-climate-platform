from __future__ import annotations

from fastapi import APIRouter
from fastapi.responses import Response

from app.observability import render_metrics

router = APIRouter(tags=["observability"])


@router.get("/metrics")
def metrics() -> Response:
    payload, content_type = render_metrics()
    return Response(content=payload, media_type=content_type)

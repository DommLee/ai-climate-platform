from __future__ import annotations

from datetime import datetime, timedelta, timezone

import requests
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app import models
from app.config import get_settings
from app.database import get_db

router = APIRouter(prefix="/maps", tags=["maps"])


def _as_naive_utc(dt: datetime) -> datetime:
    if dt.tzinfo is not None:
        return dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt


@router.get("/geocode")
def geocode(query: str = Query(..., min_length=2, max_length=200), db: Session = Depends(get_db)) -> dict:
    settings = get_settings()
    normalized = query.strip().lower()
    now = datetime.utcnow()

    cached_any = db.query(models.GeoCache).filter(models.GeoCache.query == normalized).first()
    cached = (
        db.query(models.GeoCache)
        .filter(models.GeoCache.query == normalized)
        .filter(models.GeoCache.expires_at > now)
        .first()
    )
    if cached:
        return {"query": query, "results": cached.result_json.get("results", []), "cached": True}

    url = "https://nominatim.openstreetmap.org/search"
    headers = {
        "User-Agent": f"{settings.app_name}/1.0",
    }
    params = {
        "q": query,
        "format": "jsonv2",
        "limit": 5,
    }

    response = requests.get(url, params=params, headers=headers, timeout=settings.request_timeout_seconds)
    if response.status_code >= 400:
        raise HTTPException(status_code=502, detail="Geocoding provider unavailable")

    parsed = response.json()
    payload = parsed if isinstance(parsed, list) else []
    results = []
    for item in payload:
        try:
            results.append(
                {
                    "display_name": item.get("display_name", ""),
                    "lat": float(item.get("lat")),
                    "lon": float(item.get("lon")),
                }
            )
        except Exception:
            continue

    if cached_any:
        cached_any.result_json = {"results": results}
        cached_any.fetched_at = now
        cached_any.expires_at = now + timedelta(days=3)
    else:
        db.add(
            models.GeoCache(
                query=normalized,
                result_json={"results": results},
                fetched_at=now,
                expires_at=now + timedelta(days=3),
            )
        )
    db.commit()
    return {"query": query, "results": results, "cached": False}


@router.get("/tile/{z}/{x}/{y}.png")
def map_tile(z: int, x: int, y: int, db: Session = Depends(get_db)) -> Response:
    settings = get_settings()
    if z < 0 or z > 19:
        raise HTTPException(status_code=400, detail="Invalid z")

    now = datetime.utcnow()
    cached = (
        db.query(models.TileCache)
        .filter(models.TileCache.z == z)
        .filter(models.TileCache.x == x)
        .filter(models.TileCache.y == y)
        .first()
    )

    if cached and _as_naive_utc(cached.expires_at) > now:
        return Response(
            content=bytes(cached.image_data),
            media_type=cached.content_type,
            headers={"Cache-Control": "public, max-age=3600", "X-Tile-Cache": "HIT"},
        )

    tile_url = f"https://tile.openstreetmap.org/{z}/{x}/{y}.png"
    headers = {"User-Agent": f"{settings.app_name}/1.0"}
    if cached and cached.etag:
        headers["If-None-Match"] = cached.etag

    response = requests.get(tile_url, headers=headers, timeout=settings.request_timeout_seconds)

    if response.status_code == 304 and cached:
        cached.expires_at = now + timedelta(hours=12)
        db.commit()
        return Response(
            content=bytes(cached.image_data),
            media_type=cached.content_type,
            headers={"Cache-Control": "public, max-age=3600", "X-Tile-Cache": "REVALIDATED"},
        )

    if response.status_code >= 400:
        if cached:
            return Response(
                content=bytes(cached.image_data),
                media_type=cached.content_type,
                headers={"Cache-Control": "public, max-age=300", "X-Tile-Cache": "STALE"},
            )
        raise HTTPException(status_code=502, detail="Tile provider unavailable")

    content = response.content
    content_type = response.headers.get("Content-Type", "image/png")
    etag = response.headers.get("ETag")

    if cached:
        cached.image_data = content
        cached.content_type = content_type
        cached.etag = etag
        cached.fetched_at = now
        cached.expires_at = now + timedelta(hours=12)
    else:
        db.add(
            models.TileCache(
                z=z,
                x=x,
                y=y,
                image_data=content,
                content_type=content_type,
                etag=etag,
                fetched_at=now,
                expires_at=now + timedelta(hours=12),
            )
        )
    db.commit()

    return Response(
        content=content,
        media_type=content_type,
        headers={"Cache-Control": "public, max-age=3600", "X-Tile-Cache": "MISS"},
    )

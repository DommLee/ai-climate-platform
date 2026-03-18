import React, { useEffect, useState } from "react";
import { useI18n } from "../context/I18nContext";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

function latLonToTile(lat, lon, zoom) {
  const latRad = (lat * Math.PI) / 180;
  const n = 2 ** zoom;
  const x = Math.floor(((lon + 180) / 360) * n);
  const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n);
  return { x, y };
}

function latLonToTileFloat(lat, lon, zoom) {
  const latRad = (lat * Math.PI) / 180;
  const n = 2 ** zoom;
  const x = ((lon + 180) / 360) * n;
  const y = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;
  return { x, y };
}

function normalizeTile(x, y, zoom) {
  const n = 2 ** zoom;
  const wrappedX = ((x % n) + n) % n;
  const clampedY = Math.max(0, Math.min(n - 1, y));
  return { x: wrappedX, y: clampedY };
}

export default function MapEmbed({ lat, lon, locationName = "", countryCode = "" }) {
  const { t } = useI18n();
  const [fallbackTiles, setFallbackTiles] = useState({});
  const [hardFailedTiles, setHardFailedTiles] = useState(0);

  useEffect(() => {
    setFallbackTiles({});
    setHardFailedTiles(0);
  }, [lat, lon]);

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  const zoom = 7;
  const center = latLonToTile(lat, lon, zoom);
  const centerFloat = latLonToTileFloat(lat, lon, zoom);
  const rows = [-1, 0, 1];
  const cols = [-1, 0, 1];
  const markerLeftPct = ((centerFloat.x - (center.x - 1)) / 3) * 100;
  const markerTopPct = ((centerFloat.y - (center.y - 1)) / 3) * 100;
  const markerLabel = [locationName, countryCode ? `(${countryCode})` : ""].filter(Boolean).join(" ").trim();
  const mapExternalUrl = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=${zoom}/${lat}/${lon}`;

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-3 shadow-xl">
      <div className="relative overflow-hidden rounded-xl border border-zinc-800">
        <div className="grid grid-cols-3">
          {rows.flatMap((ry) =>
            cols.map((cx) => {
              const normalized = normalizeTile(center.x + cx, center.y + ry, zoom);
              const tx = normalized.x;
              const ty = normalized.y;
              const key = `${tx}-${ty}`;
              const useDirectOsm = Boolean(fallbackTiles[key]);
              const src = useDirectOsm
                ? `https://tile.openstreetmap.org/${zoom}/${tx}/${ty}.png`
                : `${API_BASE}/api/v1/maps/tile/${zoom}/${tx}/${ty}.png`;
              return (
                <img
                  key={key}
                  src={src}
                  alt="map-tile"
                  loading="lazy"
                  onError={() => {
                    if (!useDirectOsm) {
                      setFallbackTiles((prev) => ({ ...prev, [key]: true }));
                      return;
                    }
                    setHardFailedTiles((prev) => prev + 1);
                  }}
                  className="h-24 w-full object-cover"
                />
              );
            }),
          )}
        </div>

        <div className="pointer-events-none absolute inset-0">
          <div
            className="absolute left-0 right-0 z-10 border-t border-emerald-300/30"
            style={{ top: `${Math.max(0, Math.min(100, markerTopPct)).toFixed(2)}%` }}
          />
          <div
            className="absolute top-0 bottom-0 z-10 border-l border-emerald-300/30"
            style={{ left: `${Math.max(0, Math.min(100, markerLeftPct)).toFixed(2)}%` }}
          />
          <div
            className="absolute z-20 -translate-x-1/2 -translate-y-1/2"
            style={{
              left: `${Math.max(0, Math.min(100, markerLeftPct)).toFixed(2)}%`,
              top: `${Math.max(0, Math.min(100, markerTopPct)).toFixed(2)}%`,
            }}
          >
            <div className="absolute inset-0 h-5 w-5 -translate-x-[10%] -translate-y-[10%] animate-ping rounded-full bg-emerald-400/50" />
            <div className="relative h-4 w-4 rounded-full border-2 border-zinc-950 bg-emerald-400 shadow-[0_0_0_4px_rgba(16,185,129,0.3)]" />
          </div>
          {markerLabel ? (
            <div
              className="absolute z-20 -translate-x-1/2 -translate-y-[120%] rounded-md border border-zinc-700 bg-zinc-950/90 px-2 py-1 text-[11px] font-semibold text-emerald-300 shadow-lg"
              style={{
                left: `${Math.max(0, Math.min(100, markerLeftPct)).toFixed(2)}%`,
                top: `${Math.max(0, Math.min(100, markerTopPct)).toFixed(2)}%`,
              }}
            >
              {markerLabel}
            </div>
          ) : null}
        </div>
      </div>
      <p className="mt-2 text-xs text-zinc-300">
        {t("mapFocusLabel")}:{" "}
        <span className="font-semibold text-emerald-300">
          {markerLabel || t("location")}
        </span>{" "}
        ({lat.toFixed(3)}, {lon.toFixed(3)})
      </p>
      {Object.keys(fallbackTiles).length > 0 ? <p className="mt-2 text-xs text-amber-300">{t("tileFallback")}</p> : null}
      {hardFailedTiles > 0 ? <p className="mt-2 text-xs text-red-300">{t("tileHardFail")}</p> : null}
      <a href={mapExternalUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs font-semibold text-sky-400 hover:underline">
        {t("openInOsm")}
      </a>
      <p className="mt-2 text-xs text-zinc-400">
        Map tiles: OpenStreetMap via cached proxy endpoint.
      </p>
    </div>
  );
}

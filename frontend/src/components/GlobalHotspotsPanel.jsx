import React from "react";
import { Flame } from "lucide-react";
import { useI18n } from "../context/I18nContext";

function scoreClass(score) {
  if (score >= 75) return "text-red-300";
  if (score >= 45) return "text-amber-300";
  return "text-emerald-300";
}

export default function GlobalHotspotsPanel({ items, currentLocationId, onSelectLocation }) {
  const { t } = useI18n();
  const rows = Array.isArray(items) ? items : [];

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 shadow-xl">
      <div className="flex items-center gap-2">
        <Flame size={18} className="text-rose-300" />
        <h3 className="text-lg font-bold text-zinc-100">{t("globalHotspots")}</h3>
      </div>
      <div className="mt-3 space-y-2">
        {rows.length === 0 ? (
          <p className="text-sm text-zinc-400">-</p>
        ) : (
          rows.map((item, index) => (
            <div key={`${item.location_id}-${index}`} className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-zinc-100">
                    {item.location_name} ({item.country})
                  </p>
                  <p className="text-xs text-zinc-400">Threat: {item.primary_threat}</p>
                </div>
                <p className={`text-xl font-black ${scoreClass(Number(item.overall_score))}`}>{Number(item.overall_score).toFixed(1)}</p>
              </div>
              <button
                disabled={currentLocationId === item.location_id}
                onClick={() => onSelectLocation?.(item.location_id)}
                className="mt-2 rounded-md border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-xs font-semibold text-zinc-200 hover:border-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {t("openLocation")}
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

import React from "react";
import { AlertTriangle, ShieldCheck } from "lucide-react";
import { useI18n } from "../context/I18nContext";

const STALE_THRESHOLD_MIN = 24 * 60;
const LOW_TRUST_THRESHOLD = 0.75;

export default function DataHealthBanner({ sourceAttribution = [] }) {
  const { lang } = useI18n();
  const rows = Array.isArray(sourceAttribution) ? sourceAttribution : [];
  if (!rows.length) return null;

  const stale = rows.filter((item) => Number(item?.freshness_minutes) > STALE_THRESHOLD_MIN);
  const lowTrust = rows.filter((item) => {
    const trust = Number(item?.trust_score);
    return Number.isFinite(trust) && trust < LOW_TRUST_THRESHOLD;
  });

  const healthy = stale.length === 0 && lowTrust.length === 0;
  const title =
    lang === "tr"
      ? healthy
        ? "Veri Sagligi: Stabil"
        : "Veri Sagligi: Dikkat"
      : healthy
        ? "Data Health: Stable"
        : "Data Health: Attention";

  const summary =
    lang === "tr"
      ? `Toplam ${rows.length} kaynak izlendi. Eski kaynak: ${stale.length}, dusuk guvenli kaynak: ${lowTrust.length}.`
      : `${rows.length} sources monitored. Stale: ${stale.length}, low-trust: ${lowTrust.length}.`;

  return (
    <div
      className={`rounded-2xl border p-4 shadow-xl ${
        healthy ? "border-emerald-900/60 bg-emerald-950/20" : "border-amber-900/60 bg-amber-950/20"
      }`}
    >
      <div className="flex items-center gap-2">
        {healthy ? <ShieldCheck size={16} className="text-emerald-300" /> : <AlertTriangle size={16} className="text-amber-300" />}
        <p className={`text-sm font-semibold ${healthy ? "text-emerald-200" : "text-amber-200"}`}>{title}</p>
      </div>
      <p className="mt-2 text-xs text-zinc-300">{summary}</p>
      {!healthy ? (
        <div className="mt-2 text-xs text-zinc-400">
          {stale.length > 0 ? (
            <p>
              {lang === "tr" ? "Eski kaynaklar" : "Stale sources"}: {stale.map((item) => item.source).join(", ")}
            </p>
          ) : null}
          {lowTrust.length > 0 ? (
            <p>
              {lang === "tr" ? "Dusuk guvenli kaynaklar" : "Low-trust sources"}: {lowTrust.map((item) => item.source).join(", ")}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

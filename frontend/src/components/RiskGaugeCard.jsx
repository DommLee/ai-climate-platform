import React from "react";
import { AlertTriangle, ShieldAlert } from "lucide-react";
import { useI18n } from "../context/I18nContext";

export default function RiskGaugeCard({ risk, generatedAt, sourceAttribution }) {
  const { t } = useI18n();
  if (!risk) return null;

  const score = Number(risk.overall || 0);
  const colorClass = score >= 75 ? "text-red-400" : score >= 45 ? "text-amber-300" : "text-emerald-300";
  const Icon = score >= 70 ? AlertTriangle : ShieldAlert;
  const sources = Array.isArray(sourceAttribution) ? sourceAttribution : [];

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 shadow-xl">
      <div className="flex items-center gap-3">
        <Icon className={colorClass} size={22} />
        <h3 className="text-lg font-bold text-zinc-100">{t("riskScore")}</h3>
      </div>
      <div className="mt-4 flex items-end gap-2">
        <span className={`text-5xl font-black ${colorClass}`}>{score.toFixed(1)}</span>
        <span className="pb-1 text-zinc-500">/100</span>
      </div>
      <div className="mt-4 space-y-2 text-sm">
        <p className="text-zinc-300">
          {t("primaryThreat")}: <span className="font-semibold text-zinc-100">{risk.primary_threat}</span>
        </p>
        <p className="text-zinc-300">
          {t("confidence")}: <span className="font-semibold text-zinc-100">{Number(risk.confidence).toFixed(1)}%</span>
        </p>
        <p className="text-zinc-300">
          {t("uncertainty")}: <span className="font-semibold text-zinc-100">[{risk.uncertainty_band?.[0]} - {risk.uncertainty_band?.[1]}]</span>
        </p>
      </div>

      <div className="mt-4 rounded-lg border border-zinc-800 bg-zinc-950/50 p-3">
        <p className="text-xs uppercase tracking-wide text-zinc-400">Generated</p>
        <p className="mt-1 text-sm text-zinc-200">{generatedAt ? new Date(generatedAt).toLocaleString() : "-"}</p>
        <div className="mt-3 space-y-1">
          {sources.slice(0, 3).map((item, idx) => (
            <p key={`${item.source}-${idx}`} className="text-xs text-zinc-400">
              {item.source}: freshness {item.freshness_minutes}m {item.trust_score !== undefined && item.trust_score !== null ? `| trust ${Number(item.trust_score).toFixed(2)}` : ""}
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}

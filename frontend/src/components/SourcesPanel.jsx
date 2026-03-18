import React from "react";
import { useI18n } from "../context/I18nContext";

export default function SourcesPanel({ sources }) {
  const { t } = useI18n();
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 shadow-xl">
      <h3 className="text-lg font-bold text-zinc-100">{t("sources")}</h3>
      <ul className="mt-3 space-y-2 text-sm">
        {(sources || []).map((item) => (
          <li key={item.id} className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-3">
            <p className="font-semibold text-zinc-100">{item.id}</p>
            <p className="text-zinc-300">{item.description}</p>
            <p className="text-xs text-zinc-500">License: {item.license_tag}</p>
            <p className="text-xs text-zinc-500">Freshness SLA: {item.freshness_sla_minutes} min</p>
            <a href={item.source_url} target="_blank" rel="noreferrer" className="text-emerald-400 underline-offset-2 hover:underline">
              {item.source_url}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

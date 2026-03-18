import React from "react";
import { useI18n } from "../context/I18nContext";

function levelClass(level) {
  const key = String(level || "").toLowerCase();
  if (key === "high") return "text-red-300 border-red-900/50 bg-red-900/20";
  if (key === "medium") return "text-amber-300 border-yellow-900/50 bg-yellow-900/20";
  return "text-zinc-300 border-zinc-800 bg-zinc-950/50";
}

function cleanText(value) {
  const raw = String(value || "");
  const withoutTags = raw.replace(/<[^>]+>/g, " ");
  if (typeof document === "undefined") return withoutTags.replace(/\s+/g, " ").trim();
  const decoder = document.createElement("textarea");
  decoder.innerHTML = withoutTags;
  return decoder.value.replace(/\s+/g, " ").trim();
}

export default function RecentEventsPanel({ items }) {
  const { t } = useI18n();
  const rows = items || [];

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 shadow-xl">
      <h3 className="text-lg font-bold text-zinc-100">{t("events")}</h3>
      {!rows.length && <p className="mt-2 text-sm text-zinc-400">{t("noRecentEvents")}</p>}
      <div className="mt-3 space-y-2">
        {rows.slice(0, 6).map((row) => (
          <div key={row.id} className={`rounded-lg border p-3 text-sm ${levelClass(row.severity)}`}>
            <p className="font-semibold">{cleanText(row.title)}</p>
            <p className="mt-1 text-zinc-300">{cleanText(row.summary)}</p>
            <div className="mt-2 flex items-center justify-between text-xs text-zinc-500">
              <span>{row.source}</span>
              <span>{new Date(row.occurred_at).toLocaleString()}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

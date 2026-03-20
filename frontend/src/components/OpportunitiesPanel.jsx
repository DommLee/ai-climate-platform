import React, { useEffect, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { api } from "../api/client";
import { useI18n } from "../context/I18nContext";

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString();
}

export default function OpportunitiesPanel() {
  const { lang, t } = useI18n();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError(null);
    api
      .get("/api/v1/opportunities", { params: { lang, limit: 8 } })
      .then(({ data }) => {
        if (!mounted) return;
        setItems(Array.isArray(data?.items) ? data.items : []);
      })
      .catch((err) => {
        if (!mounted) return;
        setItems([]);
        setError(err?.response?.data?.detail || "opportunities_unavailable");
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [lang]);

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 shadow-xl">
      <h3 className="text-lg font-bold text-zinc-100">{t("opportunitiesTitle")}</h3>
      <p className="mt-1 text-xs text-zinc-400">{t("opportunitiesHint")}</p>

      {loading ? (
        <div className="mt-3 flex items-center text-sm text-zinc-300">
          <LoaderCircle size={16} className="mr-2 animate-spin" />
          {t("loading")}
        </div>
      ) : items.length ? (
        <div className="mt-3 max-h-80 space-y-2 overflow-auto pr-1">
          {items.map((item) => (
            <article key={item.id} className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
              <p className="text-sm font-semibold text-zinc-100">{item.title}</p>
              <p className="mt-1 text-xs text-zinc-400">
                {item.organization} | {t("opportunitiesPublished")}: {formatDate(item.published_at)}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-zinc-300">{item.summary}</p>
              <a
                href={item.source_url}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-block text-xs font-semibold text-emerald-300 hover:underline"
              >
                {t("opportunitiesOpenSource")}
              </a>
            </article>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-sm text-zinc-400">{t("opportunitiesNoData")}</p>
      )}

      {error ? <p className="mt-2 text-xs text-amber-300">{String(error)}</p> : null}
    </div>
  );
}

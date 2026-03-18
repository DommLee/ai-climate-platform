import React, { useMemo, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { useI18n } from "../context/I18nContext";

function formatThreatLabel(value) {
  return String(value || "climate_stress")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatNumber(value, digits = 1) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "-";
  const numeric = Number(value);
  if (Math.abs(numeric) >= 1000) {
    return new Intl.NumberFormat().format(Math.round(numeric));
  }
  return numeric.toFixed(digits);
}

function pickMetric(profile, indicatorId) {
  const metric = (profile?.macro_metrics || []).find((item) => item.indicator_id === indicatorId);
  if (!metric || metric.value === null || metric.value === undefined) return "-";
  const unit = metric.unit ? ` ${metric.unit}` : "";
  return `${formatNumber(metric.value, 2)}${unit}`;
}

function metricNumeric(profile, indicatorId) {
  const metric = (profile?.macro_metrics || []).find((item) => item.indicator_id === indicatorId);
  if (!metric || metric.value === null || metric.value === undefined) return null;
  const numeric = Number(metric.value);
  return Number.isFinite(numeric) ? numeric : null;
}

function csvEscape(value) {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

export default function CountryCompare() {
  const { lang, t } = useI18n();
  const navigate = useNavigate();
  const [codesInput, setCodesInput] = useState("TUR,DEU,JPN,USA");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const parsedCodes = useMemo(() => {
    const raw = String(codesInput || "");
    const normalized = raw
      .split(",")
      .map((item) => item.trim().toUpperCase())
      .filter((item) => item.length >= 2);
    return [...new Set(normalized)].slice(0, 4);
  }, [codesInput]);

  const comparisonHighlights = useMemo(() => {
    if (!rows.length) return null;
    const byRisk = [...rows].sort((a, b) => (b.signal_summary?.computed_risk_score || 0) - (a.signal_summary?.computed_risk_score || 0));
    const byResilience = [...rows].sort((a, b) => (a.resilience_scorecard?.overall_resilience_score || 0) - (b.resilience_scorecard?.overall_resilience_score || 0));
    const byCo2 = [...rows]
      .map((row) => ({ row, value: metricNumeric(row, "EN.ATM.CO2E.PC") }))
      .filter((item) => item.value !== null)
      .sort((a, b) => (b.value || 0) - (a.value || 0));
    const byRenewables = [...rows]
      .map((row) => ({ row, value: metricNumeric(row, "EG.FEC.RNEW.ZS") }))
      .filter((item) => item.value !== null)
      .sort((a, b) => (b.value || 0) - (a.value || 0));

    return {
      highestRisk: byRisk[0] || null,
      lowestResilience: byResilience[0] || null,
      highestCo2: byCo2[0] || null,
      bestRenewables: byRenewables[0] || null,
    };
  }, [rows]);

  const handleCompare = async (event) => {
    event.preventDefault();
    if (!parsedCodes.length) return;
    setLoading(true);
    setError(null);
    try {
      const responses = await Promise.all(
        parsedCodes.map((code) =>
          api.get(`/api/v1/countries/${encodeURIComponent(code)}/profile`, {
            params: { lang, days: 180 },
          }),
        ),
      );
      setRows(responses.map((response) => response.data));
    } catch (requestError) {
      setError(requestError?.response?.data?.detail || "Comparison request failed");
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadCsv = () => {
    if (!rows.length) return;
    const header = [
      "Country",
      "ISO3",
      "Primary Threat",
      "Trend",
      "Signals",
      "Risk",
      "Resilience",
      "Renewables",
      "CO2 per Capita",
      "Forest Share",
      "GDP per Capita",
    ];
    const lines = [header.map(csvEscape).join(",")];
    rows.forEach((row) => {
      lines.push(
        [
          row.country_name,
          row.iso3,
          formatThreatLabel(row.signal_summary?.primary_threat),
          formatThreatLabel(row.historical_summary?.trend_direction),
          row.signal_summary?.total_signals,
          row.signal_summary?.computed_risk_score,
          row.resilience_scorecard?.overall_resilience_score,
          pickMetric(row, "EG.FEC.RNEW.ZS"),
          pickMetric(row, "EN.ATM.CO2E.PC"),
          pickMetric(row, "AG.LND.FRST.ZS"),
          pickMetric(row, "NY.GDP.PCAP.CD"),
        ]
          .map(csvEscape)
          .join(","),
      );
    });

    const blob = new Blob([`${lines.join("\n")}\n`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `country-compare-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-bold text-zinc-100">{t("countryCompare")}</h2>
          <button
            type="button"
            onClick={handleDownloadCsv}
            disabled={!rows.length}
            className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-zinc-100 hover:border-emerald-500 disabled:opacity-50"
          >
            {t("compareDownloadCsv")}
          </button>
        </div>
        <p className="mt-1 text-sm text-zinc-400">{t("compareCountriesHint")}</p>
        <form onSubmit={handleCompare} className="mt-3 flex flex-col gap-2 md:flex-row">
          <input
            value={codesInput}
            onChange={(event) => setCodesInput(event.target.value)}
            placeholder={t("compareInputPlaceholder")}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-950 py-2 px-3 text-sm text-zinc-100 outline-none transition focus:border-emerald-500"
          />
          <button
            type="submit"
            disabled={loading || !parsedCodes.length}
            className="rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm font-semibold text-zinc-100 hover:border-emerald-500 disabled:opacity-60 md:min-w-[130px]"
          >
            {loading ? (
              <span className="inline-flex items-center gap-2">
                <LoaderCircle size={14} className="animate-spin" />
                {t("loading")}
              </span>
            ) : (
              t("compareNow")
            )}
          </button>
        </form>
      </div>

      {rows.length ? (
        <div className="space-y-4">
          {comparisonHighlights ? (
            <div className="grid grid-cols-1 gap-3 xl:grid-cols-4">
              <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
                <p className="text-xs uppercase tracking-wide text-zinc-500">{t("compareHighestRisk")}</p>
                <p className="mt-2 text-sm font-semibold text-zinc-100">
                  {comparisonHighlights.highestRisk?.country_name || "-"} ({comparisonHighlights.highestRisk?.iso3 || "-"})
                </p>
                <p className="mt-1 text-lg font-black text-red-300">
                  {formatNumber(comparisonHighlights.highestRisk?.signal_summary?.computed_risk_score, 1)}
                </p>
              </div>
              <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
                <p className="text-xs uppercase tracking-wide text-zinc-500">{t("compareLowestResilience")}</p>
                <p className="mt-2 text-sm font-semibold text-zinc-100">
                  {comparisonHighlights.lowestResilience?.country_name || "-"} ({comparisonHighlights.lowestResilience?.iso3 || "-"})
                </p>
                <p className="mt-1 text-lg font-black text-amber-300">
                  {formatNumber(comparisonHighlights.lowestResilience?.resilience_scorecard?.overall_resilience_score, 1)}
                </p>
              </div>
              <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
                <p className="text-xs uppercase tracking-wide text-zinc-500">{t("compareHighestCo2")}</p>
                <p className="mt-2 text-sm font-semibold text-zinc-100">
                  {comparisonHighlights.highestCo2?.row?.country_name || "-"} ({comparisonHighlights.highestCo2?.row?.iso3 || "-"})
                </p>
                <p className="mt-1 text-lg font-black text-zinc-100">
                  {comparisonHighlights.highestCo2?.value !== null && comparisonHighlights.highestCo2?.value !== undefined
                    ? formatNumber(comparisonHighlights.highestCo2.value, 2)
                    : "-"}
                </p>
              </div>
              <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
                <p className="text-xs uppercase tracking-wide text-zinc-500">{t("compareBestRenewables")}</p>
                <p className="mt-2 text-sm font-semibold text-zinc-100">
                  {comparisonHighlights.bestRenewables?.row?.country_name || "-"} ({comparisonHighlights.bestRenewables?.row?.iso3 || "-"})
                </p>
                <p className="mt-1 text-lg font-black text-emerald-300">
                  {comparisonHighlights.bestRenewables?.value !== null && comparisonHighlights.bestRenewables?.value !== undefined
                    ? `${formatNumber(comparisonHighlights.bestRenewables.value, 2)}%`
                    : "-"}
                </p>
              </div>
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-4">
            {rows.map((row) => (
              <div key={row.iso3} className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
                <p className="text-base font-semibold text-zinc-100">
                  {row.country_name} ({row.iso3})
                </p>
                <p className="mt-2 text-xs text-zinc-500">{row.region || "-"}</p>
                <div className="mt-3 space-y-1 text-sm text-zinc-300">
                  <p>
                    {t("compareRisk")}: <span className="font-bold text-emerald-300">{formatNumber(row.signal_summary?.computed_risk_score, 1)}</span>
                  </p>
                  <p>
                    {t("compareResilience")}:{" "}
                    <span className="font-bold text-sky-300">{formatNumber(row.resilience_scorecard?.overall_resilience_score, 1)}</span>
                  </p>
                  <p>
                    {t("compareAdaptation")}: {formatNumber(row.resilience_scorecard?.adaptation_readiness_score, 1)}
                  </p>
                  <p>
                    {t("comparePressure")}: {formatNumber(row.resilience_scorecard?.climate_pressure_score, 1)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => navigate(`/world?country=${encodeURIComponent(row.iso3)}`)}
                  className="mt-3 rounded-md border border-zinc-700 bg-zinc-950 px-2.5 py-1 text-xs font-semibold text-zinc-200 hover:border-emerald-500"
                >
                  {t("compareOpenInWorld")}
                </button>
              </div>
            ))}
          </div>

          <div className="overflow-x-auto rounded-2xl border border-zinc-800 bg-zinc-900 shadow-xl">
            <table className="min-w-full text-sm">
              <thead className="border-b border-zinc-800 bg-zinc-950/50 text-zinc-300">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-zinc-100">Country</th>
                  <th className="px-4 py-3 text-left">{t("comparePrimaryThreat")}</th>
                  <th className="px-4 py-3 text-left">{t("compareTrend")}</th>
                  <th className="px-4 py-3 text-left">{t("compareSignals")}</th>
                  <th className="px-4 py-3 text-left">{t("compareRenewable")}</th>
                  <th className="px-4 py-3 text-left">{t("compareCo2")}</th>
                  <th className="px-4 py-3 text-left">{t("compareForest")}</th>
                  <th className="px-4 py-3 text-left">{t("compareGdpPerCapita")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={`table-${row.iso3}`}
                    className="cursor-pointer border-b border-zinc-800/70 text-zinc-200 transition hover:bg-zinc-800/40"
                    onClick={() => navigate(`/world?country=${encodeURIComponent(row.iso3)}`)}
                  >
                    <td className="px-4 py-3 font-semibold">
                      {row.country_name} ({row.iso3})
                    </td>
                    <td className="px-4 py-3">{formatThreatLabel(row.signal_summary?.primary_threat)}</td>
                    <td className="px-4 py-3">{formatThreatLabel(row.historical_summary?.trend_direction)}</td>
                    <td className="px-4 py-3">{formatNumber(row.signal_summary?.total_signals, 0)}</td>
                    <td className="px-4 py-3">{pickMetric(row, "EG.FEC.RNEW.ZS")}</td>
                    <td className="px-4 py-3">{pickMetric(row, "EN.ATM.CO2E.PC")}</td>
                    <td className="px-4 py-3">{pickMetric(row, "AG.LND.FRST.ZS")}</td>
                    <td className="px-4 py-3">{pickMetric(row, "NY.GDP.PCAP.CD")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 text-sm text-zinc-400">
          {loading ? t("loading") : t("compareNoData")}
        </div>
      )}

      {error ? <div className="rounded-xl border border-red-900 bg-red-950/40 p-4 text-sm text-red-300">{String(error)}</div> : null}
    </div>
  );
}

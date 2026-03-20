import React from "react";
import { Area, AreaChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";
import { useClimate } from "../context/ClimateContext";
import { useI18n } from "../context/I18nContext";
import SafeResponsiveChart from "../components/SafeResponsiveChart";

function normalizeFeatureName(value) {
  return String(value || "")
    .replaceAll("_", " ")
    .trim();
}

function formatFeatureValue(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "-";
  if (Math.abs(numeric) >= 100) return numeric.toFixed(1);
  if (Math.abs(numeric) >= 10) return numeric.toFixed(2);
  return numeric.toFixed(3);
}

function featureImpact(item) {
  const value = Number(item?.feature_value || 0);
  const name = String(item?.feature_name || "").toLowerCase();

  if (name.includes("event") || name.includes("pm25") || name.includes("temp_anomaly")) return Math.abs(value) * 1.25;
  if (name.includes("precip") || name.includes("wind")) return Math.abs(value) * 0.9;
  return Math.abs(value);
}

function buildFeatureNarrative(lang, item) {
  const name = String(item?.feature_name || "").toLowerCase();
  const value = Number(item?.feature_value || 0);
  const confidence = Number(item?.confidence || 0);

  if (lang === "tr") {
    if (name.includes("temp_anomaly")) {
      return value > 0
        ? "Pozitif sicaklik anomalisi yukselmis isi stresi riskine isaret ediyor."
        : "Negatif sicaklik anomalisi kisa vadede isi stresi baskisini azaltabilir.";
    }
    if (name.includes("pm25")) return "PM2.5 seviyesi hava kalitesi kaynakli saglik maruziyetini etkiliyor.";
    if (name.includes("event")) return "Son olay yogunlugu, operasyonel baski ve alarm seviyesini dogrudan yukseltiyor.";
    if (name.includes("precip")) return "Yagis olasiligi hidrometeorolojik risk senaryolarina dogrudan bagli.";
    if (name.includes("wind")) return "Ruzgar hizi, yangin yayilimi ve firtina etkisi gibi ikincil riskleri etkileyebilir.";
    return confidence >= 0.7
      ? "Ozellik sinyali modelde yuksek guvenle degerlendirildi."
      : "Ozellik sinyali orta guvenle kullanildi; belirsizlik bandi ile birlikte yorumlanmali.";
  }

  if (name.includes("temp_anomaly")) {
    return value > 0
      ? "Positive temperature anomaly indicates elevated heat-stress pressure."
      : "Negative temperature anomaly may temporarily ease heat-stress pressure.";
  }
  if (name.includes("pm25")) return "PM2.5 level directly affects air-quality related health exposure.";
  if (name.includes("event")) return "Recent event intensity is a direct driver of operational pressure and alert level.";
  if (name.includes("precip")) return "Precipitation probability is directly tied to hydro-meteorological risk scenarios.";
  if (name.includes("wind")) return "Wind speed can amplify secondary risks such as spread dynamics and storm impact.";
  return confidence >= 0.7
    ? "This feature is evaluated with high model confidence."
    : "This feature has medium confidence and should be interpreted with uncertainty band.";
}

export default function RiskAnalysis() {
  const { t, lang } = useI18n();
  const { riskData, riskFeatures, loading, error } = useClimate();
  const hasRenderableData = Boolean(riskData?.latest || (Array.isArray(riskData?.history) && riskData.history.length));

  if (loading && !hasRenderableData) {
    return <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-8 text-zinc-300">{t("loading")}</div>;
  }
  if (error && !hasRenderableData) {
    return <div className="rounded-2xl border border-red-900 bg-red-950/40 p-8 text-red-300">{String(error)}</div>;
  }
  if (!riskData) return null;

  const latest = riskData.latest;
  const confidence = Number(latest?.confidence || 0);
  const uncertaintyLow = Number(latest?.uncertainty_band?.[0] || 0);
  const uncertaintyHigh = Number(latest?.uncertainty_band?.[1] || 0);
  const uncertaintyWidth = Math.max(0, uncertaintyHigh - uncertaintyLow);
  const topDrivers = [...(riskFeatures || [])].sort((a, b) => featureImpact(b) - featureImpact(a)).slice(0, 4);

  const scenarioShift = Math.min(18, Math.max(6, uncertaintyWidth / 2));
  const baseRisk = Number(latest?.overall || 0);
  const scenarios = [
    { key: "optimistic", score: Math.max(0, baseRisk - scenarioShift) },
    { key: "baseline", score: baseRisk },
    { key: "adverse", score: Math.min(100, baseRisk + scenarioShift) },
  ];

  const scenarioLabel =
    lang === "tr"
      ? {
          optimistic: "Iyi Senaryo",
          baseline: "Baz Senaryo",
          adverse: "Kotu Senaryo",
        }
      : {
          optimistic: "Optimistic",
          baseline: "Baseline",
          adverse: "Adverse",
        };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <p className="text-xs uppercase text-zinc-400">Hazard</p>
          <p className="mt-2 text-2xl font-black">{Number(latest.hazard).toFixed(1)}</p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <p className="text-xs uppercase text-zinc-400">Exposure</p>
          <p className="mt-2 text-2xl font-black">{Number(latest.exposure).toFixed(1)}</p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <p className="text-xs uppercase text-zinc-400">Vulnerability</p>
          <p className="mt-2 text-2xl font-black">{Number(latest.vulnerability).toFixed(1)}</p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <p className="text-xs uppercase text-zinc-400">30d Probability</p>
          <p className="mt-2 text-2xl font-black">{Number(latest.probability_30d).toFixed(1)}%</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {scenarios.map((item) => (
          <div key={item.key} className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
            <p className="text-xs uppercase text-zinc-400">{scenarioLabel[item.key]}</p>
            <p
              className={`mt-2 text-3xl font-black ${
                item.score >= 70 ? "text-red-300" : item.score >= 45 ? "text-amber-300" : "text-emerald-300"
              }`}
            >
              {item.score.toFixed(1)}
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              {lang === "tr" ? "Guven" : "Confidence"}: {confidence.toFixed(1)}% | {lang === "tr" ? "Belirsizlik genisligi" : "Uncertainty width"}:{" "}
              {uncertaintyWidth.toFixed(1)}
            </p>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 shadow-xl">
        <h3 className="text-lg font-bold">Risk Trend</h3>
        <SafeResponsiveChart className="mt-4 h-80 w-full min-w-0" placeholder={t("loading")}>
          <AreaChart data={riskData.history || []}>
            <CartesianGrid stroke="#27272a" strokeDasharray="3 3" />
            <XAxis dataKey="generated_at" hide />
            <YAxis stroke="#a1a1aa" />
            <Tooltip contentStyle={{ backgroundColor: "#18181b", border: "1px solid #3f3f46" }} />
            <Area type="monotone" dataKey="overall" stroke="#f43f5e" fill="#f43f5e40" />
          </AreaChart>
        </SafeResponsiveChart>
      </div>

      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 shadow-xl">
        <h3 className="text-lg font-bold">{lang === "tr" ? "Risk Ozellikleri ve Suruculer" : "Risk Features and Drivers"}</h3>
        <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
          {(riskFeatures || []).map((item) => (
            <div key={item.feature_name} className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-3 text-sm">
              <p className="font-semibold text-zinc-100">{normalizeFeatureName(item.feature_name)}</p>
              <p className="text-zinc-300">{lang === "tr" ? "Deger" : "Value"}: {formatFeatureValue(item.feature_value)}</p>
              <p className="text-zinc-500">Source: {item.source}</p>
              <p className="text-zinc-500">{lang === "tr" ? "Guven" : "Confidence"}: {Number(item.confidence || 0).toFixed(2)}</p>
              <p className="mt-1 leading-relaxed text-zinc-400">{buildFeatureNarrative(lang, item)}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 shadow-xl">
        <h3 className="text-lg font-bold">{lang === "tr" ? "Ust Risk Suruculeri" : "Top Risk Drivers"}</h3>
        {topDrivers.length ? (
          <div className="mt-3 space-y-2">
            {topDrivers.map((item, idx) => (
              <div key={`${item.feature_name}-${idx}`} className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-3">
                <p className="text-sm font-semibold text-zinc-100">
                  {idx + 1}. {normalizeFeatureName(item.feature_name)}
                </p>
                <p className="mt-1 text-sm text-zinc-300">{buildFeatureNarrative(lang, item)}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm text-zinc-400">{lang === "tr" ? "Surucu ozellik bulunamadi." : "No driver feature data available."}</p>
        )}
      </div>
    </div>
  );
}

import React, { useMemo } from "react";
import { useI18n } from "../context/I18nContext";

function formatThreatLabel(value) {
  return String(value || "climate_stress")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function inferRiskTrend(history = []) {
  if (!Array.isArray(history) || history.length < 6) return "stable";
  const recent = history.slice(-6).map((item) => Number(item?.overall || 0));
  const previous = history.slice(-12, -6).map((item) => Number(item?.overall || 0));
  if (!recent.length || !previous.length) return "stable";
  const recentAvg = recent.reduce((sum, item) => sum + item, 0) / recent.length;
  const previousAvg = previous.reduce((sum, item) => sum + item, 0) / previous.length;
  if (recentAvg >= previousAvg + 4) return "rising";
  if (recentAvg <= previousAvg - 4) return "falling";
  return "stable";
}

function buildSectorPlaybook(primaryThreat, lang) {
  const content = {
    flood: {
      tr: [
        "Altyapi: Yagmur suyu drenaj ve kritik pompa istasyonlari icin vardiya bazli hazirlik seviyesini yukselterek saha mudahale suresini kisalt.",
        "Saglik: Acil servis ve birinci basamak birimlerinde su kaynakli enfeksiyon protokollerini aktif tut, ilac ve sarf stoklarini 72 saatlik tamponla izle.",
        "Ulasim: Alt gecit, sahil yolu ve nehir koridoru gibi hassas akslarda anlik kapatma/yonlendirme planlarini dijital levha ve mobil bildirimle eslestir.",
        "Kurumsal Operasyon: Depo ve veri merkezi gibi varliklarda su baskini hasarini azaltacak fiziksel koruma, sigorta ve yedekleme senaryolarini guncelle.",
      ],
      en: [
        "Infrastructure: Elevate shift-based readiness for stormwater drainage and critical pumping stations to reduce field response latency.",
        "Health: Keep water-borne infection protocols active in emergency and primary care units, with a 72-hour buffer for medicines and consumables.",
        "Transport: Pre-stage closure and diversion plans for underpasses, coastal roads, and river corridors through digital signage and mobile alerts.",
        "Business Continuity: Refresh flood-proofing, insurance posture, and backup scenarios for warehouses, plants, and data centers.",
      ],
    },
    drought: {
      tr: [
        "Su Yonetimi: Sehir su talebini kritik esiklere gore katmanli kisit planlarina bagla ve kayip-kacak azaltimini haftalik KPI ile takip et.",
        "Tarim/Gida: Sulama verimliligi ve urun deseni kararlarini iklim tahminleriyle birlestir; tedarik zinciri icin alternatif kaynak listesi hazirla.",
        "Enerji: Hidro bagimli sistemlerde pik talep donemleri icin yakit karmasi ve kapasite planini guvenli rezerv mantigiyla yeniden kalibre et.",
        "Yerel Yonetim: Kuraklik iletisimi, su tasarrufu kampanyasi ve mahalle bazli destek programlarini tek bir eylem takviminde birlestir.",
      ],
      en: [
        "Water Management: Tie urban demand controls to threshold-based restriction tiers and track leakage reduction with weekly KPIs.",
        "Food Systems: Align irrigation efficiency and crop-pattern decisions with climate forecasts; maintain alternative supplier lists for disruptions.",
        "Energy: Recalibrate fuel-mix and capacity plans for hydro-dependent systems with protected reserve logic during peak demand windows.",
        "Local Governance: Consolidate drought communications, savings campaigns, and neighborhood-level support programs into one execution calendar.",
      ],
    },
    wildfire: {
      tr: [
        "Saha Guvenligi: Orman-yerlesim ara yuzlerinde erken algilama ve kontrollu mudahale ekiplerinin devriye frekansini artir.",
        "Kamu Sagligi: Duman maruziyeti icin hassas gruplara (yasli, cocuk, kronik hastalar) hedefli uyarilar ve N95 dagitim planlari uygula.",
        "Elektrik Altyapisi: Hat bakimi, yuk yonetimi ve acil kesinti prosedurlerini yangin riski yuksek gunlerde otomatik tetikleyiciye bagla.",
        "Kurumsal Sureklilik: Tahliye, uzaktan calisma ve kritik operasyon transfer planlarini is surekliligi tatbikatlariyla test et.",
      ],
      en: [
        "Field Safety: Increase patrol cadence for early detection and controlled intervention teams across wildland-urban interfaces.",
        "Public Health: Trigger targeted smoke exposure alerts and N95 distribution plans for vulnerable groups.",
        "Power Networks: Link line maintenance, load management, and emergency cutoff procedures to high-fire-risk trigger days.",
        "Business Continuity: Test evacuation, remote operations, and critical workload transfer plans through live continuity drills.",
      ],
    },
    heatwave: {
      tr: [
        "Saglik: Isiya bagli vaka artisini azaltmak icin serinleme merkezleri, mobil saglik ekipleri ve 7/24 cagri destek hatlarini aktive et.",
        "Sehir Planlama: Is adasi etkisi yuksek mahallelerde golgeleme, yesil alan sulama ve yuzey sicakligi azaltici mikro-uygulamalari hizlandir.",
        "Calisma Hayati: Dis saha personeli ve lojistik ekipleri icin vardiya saatlerini sicaklik esiklerine gore yeniden duzenle.",
        "Enerji Talebi: Klima kaynakli talep piklerinde yuk dengeleme ve kritik tesislere onceliklendirilmis enerji tahsisi uygulamalarini devreye al.",
      ],
      en: [
        "Health: Activate cooling centers, mobile response teams, and 24/7 hotlines to reduce heat-related clinical spikes.",
        "Urban Operations: Accelerate shading, targeted irrigation, and surface-temperature mitigation actions in urban heat-island zones.",
        "Workforce Safety: Re-time outdoor and logistics shifts based on heat thresholds and occupational risk windows.",
        "Power Demand: Use demand balancing and prioritized supply rules for critical facilities during cooling-driven peak loads.",
      ],
    },
  };

  const key = String(primaryThreat || "").toLowerCase();
  const selected = content[key] || content.flood;
  return lang === "tr" ? selected.tr : selected.en;
}

function scoreClass(score) {
  const value = Number(score || 0);
  if (value >= 70) return "text-red-300";
  if (value >= 45) return "text-amber-300";
  return "text-emerald-300";
}

export default function InsightPanel({ insight, snapshot, riskData, events = [], locationName }) {
  const { lang, t } = useI18n();
  if (!insight?.content) return null;

  const { summary, risk_rationale, recommendations, first_72h_action_plan, citations } = insight.content;
  const risk = snapshot?.risk || riskData?.latest || null;
  const trend = inferRiskTrend(riskData?.history || []);
  const sourceAttribution = insight?.source_attribution || snapshot?.source_attribution || [];
  const avgTrust = sourceAttribution.length
    ? sourceAttribution.reduce((sum, item) => sum + Number(item?.trust_score || 0), 0) / sourceAttribution.length
    : null;
  const freshWindow = sourceAttribution.length
    ? Math.min(...sourceAttribution.map((item) => Number(item?.freshness_minutes || 99999)))
    : null;

  const severityCounts = useMemo(() => {
    const counts = { high: 0, medium: 0, low: 0 };
    (events || []).forEach((item) => {
      const severity = String(item?.severity || "medium").toLowerCase();
      if (counts[severity] !== undefined) counts[severity] += 1;
      else counts.medium += 1;
    });
    return counts;
  }, [events]);

  const trendText =
    trend === "rising" ? t("insightTrendRising") : trend === "falling" ? t("insightTrendFalling") : t("insightTrendStable");
  const operationalNarrative = [
    lang === "tr"
      ? `${locationName || snapshot?.location_name || "Secili lokasyon"} icin genel risk skoru ${Number(risk?.overall || 0).toFixed(1)}/100 seviyesinde. Ana tehdit ${formatThreatLabel(
          risk?.primary_threat,
        )} olarak izleniyor ve belirsizlik araligi ${Number(risk?.uncertainty_band?.[0] || 0).toFixed(1)}-${Number(risk?.uncertainty_band?.[1] || 0).toFixed(1)} bandinda seyrediyor.`
      : `For ${locationName || snapshot?.location_name || "the selected location"}, overall risk is ${Number(risk?.overall || 0).toFixed(
          1,
        )}/100. The primary threat is ${formatThreatLabel(risk?.primary_threat)}, with uncertainty currently in the ${Number(
          risk?.uncertainty_band?.[0] || 0,
        ).toFixed(1)}-${Number(risk?.uncertainty_band?.[1] || 0).toFixed(1)} range.`,
    lang === "tr"
      ? `Anlik kosullarda sicaklik ${Number(snapshot?.current_weather?.temperature_c || 0).toFixed(1)} C, nem ${Number(
          snapshot?.current_weather?.humidity_pct || 0,
        ).toFixed(0)}% ve ruzgar ${Number(snapshot?.current_weather?.wind_kmh || 0).toFixed(
          1,
        )} km/saat seviyesinde. Olay nabzinda yuksek siddetli ${severityCounts.high}, orta siddetli ${severityCounts.medium} sinyal bulunuyor; bu dagilim saha ekiplerinin onceliklendirme planlarini dogrudan etkiliyor.`
      : `Current conditions show temperature at ${Number(snapshot?.current_weather?.temperature_c || 0).toFixed(1)} C, humidity at ${Number(
          snapshot?.current_weather?.humidity_pct || 0,
        ).toFixed(0)}%, and wind at ${Number(snapshot?.current_weather?.wind_kmh || 0).toFixed(
          1,
        )} km/h. Event pulse indicates ${severityCounts.high} high-severity and ${severityCounts.medium} medium-severity signals, which should directly inform field prioritization.`,
    lang === "tr"
      ? `Sonuclari yorumlarken model guven seviyesi ${Number(risk?.confidence || 0).toFixed(
          1,
        )}% oldugu icin kararlarin kaynak atifli izlenmesi gerekiyor. ${trendText}`
      : `Given a model confidence level of ${Number(risk?.confidence || 0).toFixed(
          1,
        )}%, decisions should remain source-attributed and auditable. ${trendText}`,
  ];

  const thirtyDayPriorities =
    lang === "tr"
      ? [
          "Sinyal yogunlugu en yuksek mahalle/ilceler icin haftalik saha dogrulama ve aksiyon kapanis toplantisi yap.",
          "Erken uyari ve kriz iletisim metinlerini tek formatta standardize edip yerel paydaslarla test et.",
          "Kritik altyapi (su, enerji, ulasim, saglik) icin asgari hizmet seviyesi hedeflerini yeniden kalibre et.",
          "Olay sonrasi geri bildirimleri (feedback loop) model iyilestirme backlog'una otomatik aktar.",
          "SLA ihlali olan veri kaynaklarini guven skoruna gore agirliklandir ve gerekirse yedek kaynaklarla degistir.",
        ]
      : [
          "Run weekly field-validation and action-closure sessions for districts with the densest signal concentration.",
          "Standardize early-warning and crisis communication templates and test them with local stakeholders.",
          "Recalibrate minimum service-level objectives for critical systems: water, power, transport, and health.",
          "Push post-incident feedback signals into the model-improvement backlog automatically.",
          "Reweight or replace stale data streams based on trust score and SLA breach behavior.",
        ];

  const sectorPlaybook = buildSectorPlaybook(risk?.primary_threat, lang);

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 shadow-xl">
        <h3 className="text-lg font-bold text-zinc-100">{t("insightSituation")}</h3>
        <p className="mt-1 text-xs text-zinc-500">
          {insight.provider}/{insight.model} | {new Date(insight.generated_at).toLocaleString()}
        </p>
        <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-3">
            <p className="text-[11px] uppercase tracking-wide text-zinc-500">{t("riskScore")}</p>
            <p className={`mt-1 text-xl font-extrabold ${scoreClass(risk?.overall)}`}>{Number(risk?.overall || 0).toFixed(1)}</p>
          </div>
          <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-3">
            <p className="text-[11px] uppercase tracking-wide text-zinc-500">{t("primaryThreat")}</p>
            <p className="mt-1 text-sm font-semibold text-zinc-100">{formatThreatLabel(risk?.primary_threat)}</p>
          </div>
          <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-3">
            <p className="text-[11px] uppercase tracking-wide text-zinc-500">{t("confidence")}</p>
            <p className="mt-1 text-xl font-extrabold text-sky-300">{Number(risk?.confidence || 0).toFixed(1)}%</p>
          </div>
          <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-3">
            <p className="text-[11px] uppercase tracking-wide text-zinc-500">{t("uncertainty")}</p>
            <p className="mt-1 text-sm font-semibold text-zinc-100">
              {Number(risk?.uncertainty_band?.[0] || 0).toFixed(1)} - {Number(risk?.uncertainty_band?.[1] || 0).toFixed(1)}
            </p>
          </div>
        </div>
        <p className="mt-3 text-zinc-300">{summary}</p>
      </div>

      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 shadow-xl">
        <h3 className="text-lg font-bold text-zinc-100">{t("insightOperationalNarrative")}</h3>
        <div className="mt-2 space-y-3 text-sm leading-relaxed text-zinc-300">
          {operationalNarrative.map((paragraph, idx) => (
            <p key={`narrative-${idx}`}>{paragraph}</p>
          ))}
          <p className="text-zinc-200">{risk_rationale}</p>
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 shadow-xl">
        <h3 className="text-lg font-bold text-zinc-100">{t("insightStrategicOutlook")}</h3>
        <p className="mt-2 text-sm leading-relaxed text-zinc-300">{trendText}</p>
        <h4 className="mt-4 text-sm font-semibold text-zinc-100">{t("insight30DayPriorities")}</h4>
        <ul className="mt-2 list-disc space-y-2 pl-5 text-zinc-300">
          {thirtyDayPriorities.map((item, idx) => (
            <li key={`priority-${idx}`}>{item}</li>
          ))}
        </ul>
      </div>

      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 shadow-xl">
        <h3 className="text-lg font-bold text-zinc-100">{t("insightSectorPlaybook")}</h3>
        <ul className="mt-2 list-disc space-y-2 pl-5 text-zinc-300">
          {sectorPlaybook.map((item, idx) => (
            <li key={`sector-${idx}`}>{item}</li>
          ))}
        </ul>
      </div>

      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 shadow-xl">
        <h3 className="text-lg font-bold text-zinc-100">{t("recommendations")}</h3>
        <ul className="mt-2 list-disc space-y-2 pl-5 text-zinc-300">
          {(recommendations || []).map((item, idx) => (
            <li key={`rec-${idx}`}>{item}</li>
          ))}
        </ul>
      </div>

      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 shadow-xl">
        <h3 className="text-lg font-bold text-zinc-100">{t("action72h")}</h3>
        <ul className="mt-2 list-disc space-y-2 pl-5 text-zinc-300">
          {(first_72h_action_plan || []).map((item, idx) => (
            <li key={`a72-${idx}`}>{item}</li>
          ))}
        </ul>
      </div>

      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 shadow-xl">
        <h3 className="text-lg font-bold text-zinc-100">{t("insightEventPulse")}</h3>
        {events?.length ? (
          <div className="mt-2 space-y-2 text-sm text-zinc-300">
            <p>
              High: <span className="font-semibold text-red-300">{severityCounts.high}</span> | Medium:{" "}
              <span className="font-semibold text-amber-300">{severityCounts.medium}</span> | Low:{" "}
              <span className="font-semibold text-emerald-300">{severityCounts.low}</span>
            </p>
            <ul className="list-disc space-y-1 pl-5 text-zinc-300">
              {events.slice(0, 5).map((item) => (
                <li key={`event-${item.id || item.occurred_at}`}>
                  {item.title}
                  {" - "}
                  <span className="text-zinc-500">{new Date(item.occurred_at).toLocaleString()}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="mt-2 text-sm text-zinc-400">{t("insightNoEvents")}</p>
        )}
      </div>

      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 shadow-xl">
        <h3 className="text-lg font-bold text-zinc-100">{t("insightDataQuality")}</h3>
        <div className="mt-2 space-y-2 text-sm text-zinc-300">
          <p>
            {lang === "tr" ? "Kaynak sayisi" : "Source count"}: <span className="font-semibold text-zinc-100">{sourceAttribution.length}</span>
          </p>
          <p>
            {lang === "tr" ? "Ortalama guven skoru" : "Average trust score"}:{" "}
            <span className="font-semibold text-zinc-100">{avgTrust !== null ? `${(avgTrust * 100).toFixed(1)}%` : "-"}</span>
          </p>
          <p>
            {lang === "tr" ? "En iyi tazelik penceresi" : "Best freshness window"}:{" "}
            <span className="font-semibold text-zinc-100">{freshWindow !== null ? `${freshWindow} min` : "-"}</span>
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 shadow-xl">
        <h3 className="text-lg font-bold text-zinc-100">{t("citations")}</h3>
        <ul className="mt-2 space-y-2 text-sm text-zinc-300">
          {(citations || []).map((item, idx) => (
            <li key={`citation-${idx}`} className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-3">
              <p className="font-semibold text-zinc-100">{item.source}</p>
              <a href={item.source_url} target="_blank" rel="noreferrer" className="text-emerald-400 hover:underline">
                {item.source_url}
              </a>
              <p className="mt-1 text-xs text-zinc-500">{new Date(item.timestamp_utc).toLocaleString()}</p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

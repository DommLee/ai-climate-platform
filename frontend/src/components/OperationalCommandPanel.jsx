import React from "react";
import { Activity, AlertTriangle, Clock3, ShieldCheck } from "lucide-react";
import { useI18n } from "../context/I18nContext";

function average(values) {
  if (!values.length) return 0;
  return values.reduce((acc, value) => acc + value, 0) / values.length;
}

function normalizeThreat(value) {
  return String(value || "climate_stress").replaceAll("_", " ").trim();
}

function buildActionPlan(tier, threatLabel, lang) {
  if (lang === "tr") {
    if (tier === "critical") {
      return {
        window6h: [
          `${threatLabel} odakli saha izleme dongusunu 6 saatlik moda al.`,
          "Acil durum iletisim zincirini aktif et ve kurum sorumluluklarini teyit et.",
          "Su, enerji ve saglik altyapisinda kritik kesinti toleransini yeniden hesapla.",
        ],
        window24h: [
          "Yuksek riskli mahallelerde hedefli bilgilendirme ve tahliye hazirlik kontrolu yap.",
          "Operasyon merkezi icin tek kaynakli durum raporunu (SITREP) yayinla.",
          "On saftaki ekiplerde vardiya kapasitesini arttir.",
        ],
        window72h: [
          "Yeni sinyallerle model skorunu tekrar kalibre et, kaynak dagitimini revize et.",
          "Yakıt, medikal lojistik ve temiz su icin tampon stok ac.",
          "En yuksek maruziyetli alanlar icin toparlanma odakli senaryolari hazirla.",
        ],
      };
    }

    if (tier === "elevated") {
      return {
        window6h: [
          `${threatLabel} baglaminda erken uyari metinlerini guncelle.`,
          "Veri tazelik SLA ve sensor akis surekliligini dogrula.",
          "Ekipler arasi kisa operasyon hizalama toplantisi yap.",
        ],
        window24h: [
          "Kamu bilgilendirme metinlerini mevcut risk seviyesine gore sadeleştir.",
          "Ilce bazli kaynak hazirlik ve kapsama durumunu kontrol et.",
          "Su, enerji ve ulasim servislerinde yedek rota planlarini test et.",
        ],
        window72h: [
          "Trend bozulmasi icin kritik moda gecis tetikleyicilerini hazir tut.",
          "Sinyal yogunlugu yuksek bolgeler icin yerel aksiyon listesi yayinla.",
          "Kaynak atifli yonetsel haftalik risk ozetini olustur.",
        ],
      };
    }

    return {
      window6h: [
        "Temel izleme frekansini koru, anomali alarm kanallarini acik tut.",
        "Ana veri kaynaklarinin erisilebilirligini rutin kontrol et.",
        "Yerel ekiplerle kisa durum notu paylas.",
      ],
      window24h: [
        "Dusuk maliyetli dayaniklilik adimlarini (tatbikat, checklist, farkindalik) surdur.",
        "Haber ve olay sinyallerindeki gurultu filtrelerini optimize et.",
        "Kisa kaynak-atifli gunluk ozet yayinla.",
      ],
      window72h: [
        "Yeni olay kumesi gorulurse risk skorlamasini tekrar calistir.",
        "Sektor esiklerini kritik seviyeye gecis acisindan gozden gecir.",
        "Bir sonraki 15 dakikalik dongu oncesi veri sagligi dogrulamasini tamamla.",
      ],
    };
  }

  if (tier === "critical") {
    return {
      window6h: [
        `Switch to a 6-hour field monitoring cycle focused on ${threatLabel}.`,
        "Activate the emergency communication chain and confirm agency ownership.",
        "Recalculate outage tolerance for water, energy, and health infrastructure.",
      ],
      window24h: [
        "Run targeted public guidance and evacuation readiness checks in high-risk districts.",
        "Publish a single-source operational SITREP for all response teams.",
        "Increase frontline shift capacity and standby coverage.",
      ],
      window72h: [
        "Recalibrate risk scoring with new signals and reprioritize resources.",
        "Open contingency buffers for fuel, medical logistics, and clean water.",
        "Prepare recovery-first playbooks for the most exposed zones.",
      ],
    };
  }

  if (tier === "elevated") {
    return {
      window6h: [
        `Update warning templates for the current ${threatLabel} pattern.`,
        "Validate source freshness SLA and sensor continuity.",
        "Run a short cross-team operational sync.",
      ],
      window24h: [
        "Simplify public communication copy based on this risk tier.",
        "Check district-level resource readiness and response coverage.",
        "Test fallback routes for water, power, and transport services.",
      ],
      window72h: [
        "Prepare critical-mode triggers if the trend deteriorates.",
        "Publish local action checklists for high-signal neighborhoods.",
        "Generate a source-attributed weekly executive risk summary.",
      ],
    };
  }

  return {
    window6h: [
      "Keep baseline monitoring cadence and anomaly channels active.",
      "Run routine availability checks for core data sources.",
      "Share a short operational status note with local teams.",
    ],
    window24h: [
      "Continue low-cost resilience actions: drills, checklists, and awareness updates.",
      "Tune event/news noise filters for better signal quality.",
      "Publish a concise source-attributed daily summary.",
    ],
    window72h: [
      "Rerun risk scoring if new event clusters emerge.",
      "Review sector thresholds for escalation readiness.",
      "Complete data-health validation before the next 15-minute loop.",
    ],
  };
}

export default function OperationalCommandPanel({ snapshot, riskData, events, locationName }) {
  const { lang } = useI18n();
  const risk = snapshot?.risk;
  if (!risk) return null;

  const history = Array.isArray(riskData?.history) ? riskData.history : [];
  const recentBand = history.slice(-6).map((item) => Number(item?.overall || 0));
  const previousBand = history.slice(-12, -6).map((item) => Number(item?.overall || 0));
  const trendDelta = average(recentBand) - average(previousBand);
  const trend = trendDelta > 1.8 ? "rising" : trendDelta < -1.8 ? "falling" : "stable";

  const overall = Number(risk.overall || 0);
  const probability = Number(risk.probability_30d || 0);
  const confidence = Number(risk.confidence || 0);
  const threatLabel = normalizeThreat(risk.primary_threat);

  const rows = Array.isArray(events) ? events : [];
  const now = Date.now();
  const last24h = rows.filter((item) => {
    const ts = new Date(item?.occurred_at || "").getTime();
    return Number.isFinite(ts) && ts >= now - 24 * 60 * 60 * 1000;
  });
  const highLast24h = last24h.filter((item) => String(item?.severity || "").toLowerCase() === "high");

  const sourceAttribution = Array.isArray(snapshot?.source_attribution) ? snapshot.source_attribution : [];
  const freshnessValues = sourceAttribution.map((item) => Number(item?.freshness_minutes)).filter((value) => Number.isFinite(value));
  const minFreshness = freshnessValues.length ? Math.min(...freshnessValues) : null;
  const maxFreshness = freshnessValues.length ? Math.max(...freshnessValues) : null;

  const trustValues = sourceAttribution
    .map((item) => Number(item?.trust_score))
    .filter((value) => Number.isFinite(value));
  const avgTrust = trustValues.length ? average(trustValues) : null;

  let tier = "watch";
  if (overall >= 70 || probability >= 70 || (trend === "rising" && overall >= 58)) {
    tier = "critical";
  } else if (overall >= 45 || probability >= 45 || trend === "rising") {
    tier = "elevated";
  }

  const tierStyles =
    tier === "critical"
      ? "border-red-900/60 bg-red-950/30 text-red-200"
      : tier === "elevated"
        ? "border-amber-900/60 bg-amber-950/20 text-amber-200"
        : "border-emerald-900/60 bg-emerald-950/20 text-emerald-200";

  const plan = buildActionPlan(tier, threatLabel, lang);

  const copy =
    lang === "tr"
      ? {
          title: "Operasyonel Komuta Merkezi",
          critical: "Kritik Alarm",
          elevated: "Yukselmis Alarm",
          watch: "Izleme Modu",
          trend: "Risk trendi",
          pulse: "24s sinyal nabzi",
          highSignals: "Yuksek siddetli",
          confidence: "Model guveni",
          freshness: "Veri tazelik araligi",
          brief: `${locationName || "Secili lokasyon"} icin risk seviyesi ${overall.toFixed(1)}/100. Alarm seviyesi, olay yogunlugu, veri tazeligi ve trendin birlestirilmesiyle hesaplandi.`,
          warning:
            tier === "critical"
              ? "Ayni vardiyada saha aksiyonlarini hizlandir ve kaynak planlamasini kritik moda al."
              : tier === "elevated"
                ? "Kontrollu ama hizli hazirlik seviyesini koru; bozulma senaryosuna hazir ol."
                : "Durum stabil; onleyici kontrolleri ve veri kalitesini yuksek tut.",
          window6h: "0-6 Saat",
          window24h: "6-24 Saat",
          window72h: "24-72 Saat",
        }
      : {
          title: "Operational Command Center",
          critical: "Critical Alert",
          elevated: "Elevated Alert",
          watch: "Watch Mode",
          trend: "Risk trend",
          pulse: "24h signal pulse",
          highSignals: "High severity",
          confidence: "Model confidence",
          freshness: "Data freshness range",
          brief: `Current risk for ${locationName || "selected location"} is ${overall.toFixed(1)}/100. Alert tier is computed by combining event intensity, source freshness, and trend direction.`,
          warning:
            tier === "critical"
              ? "Accelerate field actions within the same shift and switch planning to critical mode."
              : tier === "elevated"
                ? "Keep controlled but fast readiness to absorb potential deterioration."
                : "Situation is stable; keep preventive controls and data quality at a high level.",
          window6h: "0-6 Hours",
          window24h: "6-24 Hours",
          window72h: "24-72 Hours",
        };

  const trendClass = trend === "rising" ? "text-amber-300" : trend === "falling" ? "text-emerald-300" : "text-zinc-200";
  const tierLabel = tier === "critical" ? copy.critical : tier === "elevated" ? copy.elevated : copy.watch;

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 shadow-xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          {tier === "critical" ? <AlertTriangle size={18} className="text-red-300" /> : <ShieldCheck size={18} className="text-emerald-300" />}
          <h3 className="text-lg font-bold text-zinc-100">{copy.title}</h3>
        </div>
        <span className={`rounded-md border px-2.5 py-1 text-xs font-semibold ${tierStyles}`}>{tierLabel}</span>
      </div>

      <p className="mt-3 text-sm leading-relaxed text-zinc-300">{copy.brief}</p>
      <p className="mt-2 text-sm leading-relaxed text-zinc-200">{copy.warning}</p>

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
          <p className="text-xs uppercase tracking-wide text-zinc-500">{copy.trend}</p>
          <p className={`mt-1 text-base font-bold ${trendClass}`}>
            {trend} ({trendDelta >= 0 ? "+" : ""}
            {trendDelta.toFixed(1)})
          </p>
        </div>
        <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
          <p className="text-xs uppercase tracking-wide text-zinc-500">{copy.pulse}</p>
          <p className="mt-1 text-base font-bold text-zinc-100">{last24h.length}</p>
        </div>
        <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
          <p className="text-xs uppercase tracking-wide text-zinc-500">{copy.highSignals}</p>
          <p className="mt-1 text-base font-bold text-zinc-100">{highLast24h.length}</p>
        </div>
        <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
          <p className="text-xs uppercase tracking-wide text-zinc-500">{copy.confidence}</p>
          <p className="mt-1 text-base font-bold text-zinc-100">{confidence.toFixed(1)}%</p>
        </div>
      </div>

      <div className="mt-4 rounded-lg border border-zinc-800 bg-zinc-950/40 p-3 text-xs text-zinc-300">
        <div className="mb-1 flex items-center gap-2 text-zinc-200">
          <Clock3 size={14} />
          <span className="font-semibold">{copy.freshness}</span>
        </div>
        <p>
          {minFreshness !== null ? `${minFreshness}m` : "-"} to {maxFreshness !== null ? `${maxFreshness}m` : "-"} | trust:{" "}
          {avgTrust !== null ? avgTrust.toFixed(2) : "-"}
        </p>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-3">
        <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
          <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
            <Activity size={13} />
            {copy.window6h}
          </p>
          <ul className="space-y-1.5 text-sm text-zinc-300">
            {plan.window6h.map((item, idx) => (
              <li key={`w6-${idx}`}>- {item}</li>
            ))}
          </ul>
        </div>
        <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">{copy.window24h}</p>
          <ul className="space-y-1.5 text-sm text-zinc-300">
            {plan.window24h.map((item, idx) => (
              <li key={`w24-${idx}`}>- {item}</li>
            ))}
          </ul>
        </div>
        <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">{copy.window72h}</p>
          <ul className="space-y-1.5 text-sm text-zinc-300">
            {plan.window72h.map((item, idx) => (
              <li key={`w72-${idx}`}>- {item}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

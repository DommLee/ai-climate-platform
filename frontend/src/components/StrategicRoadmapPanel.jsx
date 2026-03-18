import React from "react";
import { useI18n } from "../context/I18nContext";

export default function StrategicRoadmapPanel() {
  const { lang } = useI18n();

  const copy =
    lang === "tr"
      ? {
          title: "Kuresel Gelisim Yol Haritasi",
          intro:
            "Platform artik sadece anlik risk gostermek yerine ulke-sehir-sektor duzeyinde karar destegi sunacak sekilde evriliyor. Bu panel, public paylasima hazir bir urun icin odaklanilmasi gereken adimlari ozetler.",
          track1: "Veri Katmani (0-30 gun)",
          track1Items: [
            "Ulke bazli haber sinyallerini kalite skoruna gore agirliklandir.",
            "Kaynak tazelik alarmini otomatik gecikme raporuna bagla.",
            "CO2, enerji ve su metriklerinde yedek veri kaynagi stratejisini aktif et.",
          ],
          track2: "Risk ve Model Katmani (30-60 gun)",
          track2Items: [
            "Deterministik skor + olasilik modeli birlikteligiyle cift katmanli risk raporu yayinla.",
            "Model degisim gunlugunu UI uzerinde gorunur hale getir.",
            "Ulke profillerinde belirsizlik etkisini senaryo bazli acikla.",
          ],
          track3: "Urun ve Operasyon (60-90 gun)",
          track3Items: [
            "Kurumsal kullanim icin API anahtari, oran limitleri ve denetim loglarini ac.",
            "Sektor bazli playbook paketlerini (belediye, enerji, saglik, lojistik) ayir.",
            "PDF raporuna KPI ilerleme tablosu ve onceki donem karsilastirmasi ekle.",
          ],
          metrics: "Takip KPI'lari",
          metricItems: [
            "Risk karti kaynak gorunurlugu: %100",
            "Uretim API p95 gecikme: < 800ms",
            "PDF p95 hazirlama suresi: < 60sn",
            "LLM kesintisinde fallback ile servis devam orani: > %99",
          ],
        }
      : {
          title: "Global Expansion Roadmap",
          intro:
            "The platform is evolving from a dashboard into a decision-support system across country, city, and sector levels. This panel summarizes high-impact workstreams for a shareable public product.",
          track1: "Data Layer (0-30 days)",
          track1Items: [
            "Weight country news signals by quality score and source reliability.",
            "Connect freshness SLA breaches to automated delay reporting.",
            "Activate backup-source strategy for CO2, energy, and water indicators.",
          ],
          track2: "Risk and Model Layer (30-60 days)",
          track2Items: [
            "Publish dual-layer risk outputs combining deterministic and probabilistic scores.",
            "Expose model-change logs in the UI for governance traceability.",
            "Explain uncertainty impact in country profiles through scenario narratives.",
          ],
          track3: "Product and Operations (60-90 days)",
          track3Items: [
            "Enable API keys, rate limits, and audit logs for external usage.",
            "Split sector playbooks for municipalities, energy, health, and logistics.",
            "Add KPI progress and prior-period comparison to executive PDF output.",
          ],
          metrics: "Tracking KPIs",
          metricItems: [
            "Risk-card source visibility: 100%",
            "Production API p95 latency: < 800ms",
            "PDF generation p95: < 60s",
            "Service continuity with deterministic fallback during LLM outage: > 99%",
          ],
        };

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 shadow-xl">
      <h3 className="text-lg font-bold text-zinc-100">{copy.title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-zinc-300">{copy.intro}</p>

      <div className="mt-4 space-y-3">
        <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-3">
          <p className="text-sm font-semibold text-zinc-100">{copy.track1}</p>
          <ul className="mt-2 space-y-1 text-sm text-zinc-300">
            {copy.track1Items.map((item, idx) => (
              <li key={`t1-${idx}`}>- {item}</li>
            ))}
          </ul>
        </div>

        <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-3">
          <p className="text-sm font-semibold text-zinc-100">{copy.track2}</p>
          <ul className="mt-2 space-y-1 text-sm text-zinc-300">
            {copy.track2Items.map((item, idx) => (
              <li key={`t2-${idx}`}>- {item}</li>
            ))}
          </ul>
        </div>

        <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-3">
          <p className="text-sm font-semibold text-zinc-100">{copy.track3}</p>
          <ul className="mt-2 space-y-1 text-sm text-zinc-300">
            {copy.track3Items.map((item, idx) => (
              <li key={`t3-${idx}`}>- {item}</li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mt-4 rounded-lg border border-zinc-800 bg-zinc-950/50 p-3">
        <p className="text-sm font-semibold text-zinc-100">{copy.metrics}</p>
        <ul className="mt-2 space-y-1 text-sm text-zinc-300">
          {copy.metricItems.map((item, idx) => (
            <li key={`kpi-${idx}`}>- {item}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

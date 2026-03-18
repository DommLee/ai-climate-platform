const DEMO_LOCATIONS = [
  { id: "new_york", name: "New York", country: "US", lat: 40.7128, lon: -74.006 },
  { id: "istanbul", name: "Istanbul", country: "TR", lat: 41.0082, lon: 28.9784 },
  { id: "berlin", name: "Berlin", country: "DE", lat: 52.52, lon: 13.405 },
  { id: "tokyo", name: "Tokyo", country: "JP", lat: 35.6762, lon: 139.6503 },
  { id: "sao_paulo", name: "Sao Paulo", country: "BR", lat: -23.5558, lon: -46.6396 },
  { id: "nairobi", name: "Nairobi", country: "KE", lat: -1.2864, lon: 36.8172 },
];

const COUNTRY_DATA = {
  TUR: { country_name: "Turkey", region: "Europe & Central Asia", capital: "Ankara", population: 85816199, area_km2: 783562, lat: 39.0, lon: 35.0 },
  USA: { country_name: "United States", region: "North America", capital: "Washington", population: 335000000, area_km2: 9833520, lat: 39.8, lon: -98.5 },
  DEU: { country_name: "Germany", region: "Europe & Central Asia", capital: "Berlin", population: 84300000, area_km2: 357022, lat: 51.2, lon: 10.4 },
  JPN: { country_name: "Japan", region: "East Asia & Pacific", capital: "Tokyo", population: 124000000, area_km2: 377975, lat: 36.2, lon: 138.3 },
  BRA: { country_name: "Brazil", region: "Latin America & Caribbean", capital: "Brasilia", population: 203000000, area_km2: 8515767, lat: -10.8, lon: -52.9 },
  KEN: { country_name: "Kenya", region: "Sub-Saharan Africa", capital: "Nairobi", population: 55000000, area_km2: 580367, lat: 0.2, lon: 37.9 },
};

const COUNTRY_ALIASES = {
  turkey: "TUR",
  turkiye: "TUR",
  tur: "TUR",
  usa: "USA",
  "united states": "USA",
  "united states of america": "USA",
  deu: "DEU",
  germany: "DEU",
  jpn: "JPN",
  japan: "JPN",
  bra: "BRA",
  brazil: "BRA",
  ken: "KEN",
  kenya: "KEN",
};

const THREATS = ["drought", "flood", "wildfire", "heatwave"];
const SOURCE_ATTRIBUTION = [
  { source: "open_meteo", freshness_minutes: 35, trust_score: 0.92 },
  { source: "nasa_power", freshness_minutes: 240, trust_score: 0.89 },
  { source: "reliefweb", freshness_minutes: 180, trust_score: 0.86 },
];

const REPORT_STORE = new Map();

function nowIso() {
  return new Date().toISOString();
}

function hashString(value) {
  let hash = 0;
  const text = String(value || "");
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash << 5) - hash + text.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function seeded(value, min, max) {
  const h = hashString(value) % 1000;
  const ratio = h / 999;
  return min + (max - min) * ratio;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function pickThreat(seedKey) {
  return THREATS[hashString(seedKey) % THREATS.length];
}

function resolveLocation(locationId) {
  return DEMO_LOCATIONS.find((item) => item.id === locationId) || DEMO_LOCATIONS[0];
}

function generateRisk(locationId) {
  const overall = clamp(seeded(`${locationId}:overall`, 28, 78), 0, 100);
  const hazard = clamp(seeded(`${locationId}:hazard`, 20, 85), 0, 100);
  const exposure = clamp(seeded(`${locationId}:exposure`, 18, 82), 0, 100);
  const vulnerability = clamp(seeded(`${locationId}:vulnerability`, 24, 80), 0, 100);
  const probability = clamp(seeded(`${locationId}:probability`, 25, 86), 0, 100);
  const confidence = clamp(seeded(`${locationId}:confidence`, 72, 91), 0, 100);
  const uncertainty = clamp(seeded(`${locationId}:uncertainty`, 9, 24), 0, 100);

  return {
    overall: Number(overall.toFixed(1)),
    primary_threat: pickThreat(`${locationId}:threat`),
    confidence: Number(confidence.toFixed(1)),
    uncertainty_band: [Number((overall - uncertainty / 2).toFixed(2)), Number((overall + uncertainty / 2).toFixed(2))],
    hazard: Number(hazard.toFixed(1)),
    exposure: Number(exposure.toFixed(1)),
    vulnerability: Number(vulnerability.toFixed(1)),
    probability_30d: Number(probability.toFixed(1)),
  };
}

function generateHistory(locationId, points = 24) {
  const risk = generateRisk(locationId);
  const base = risk.overall;
  const rows = [];
  for (let idx = points - 1; idx >= 0; idx -= 1) {
    const ts = new Date(Date.now() - idx * 6 * 60 * 60 * 1000);
    const wave = Math.sin((idx / points) * Math.PI * 3) * 4;
    const jitter = seeded(`${locationId}:history:${idx}`, -2.8, 2.8);
    rows.push({
      generated_at: ts.toISOString(),
      overall: Number(clamp(base + wave + jitter, 0, 100).toFixed(1)),
    });
  }
  return rows;
}

function generateForecast(locationId, points = 18) {
  const location = resolveLocation(locationId);
  const tempBase = seeded(`${location.id}:temp`, 8, 30);
  const rows = [];
  for (let idx = 0; idx < points; idx += 1) {
    const ts = new Date(Date.now() + idx * 3 * 60 * 60 * 1000);
    const wave = Math.sin((idx / points) * Math.PI * 2.2) * 4;
    const drift = seeded(`${location.id}:forecast:${idx}`, -1.2, 1.2);
    rows.push({ timestamp: ts.toISOString(), value: Number((tempBase + wave + drift).toFixed(2)) });
  }
  return rows;
}

function generateEvents(locationId) {
  const threat = pickThreat(`${locationId}:event`);
  const names = {
    drought: "Water stress advisory updated",
    flood: "Flash flood watch issued",
    wildfire: "Wildfire smoke advisory expanded",
    heatwave: "Heatwave health bulletin updated",
  };

  const rows = [];
  for (let i = 0; i < 6; i += 1) {
    const ts = new Date(Date.now() - i * 11 * 60 * 60 * 1000);
    const severity = i < 2 ? "high" : i < 4 ? "medium" : "low";
    rows.push({
      id: `${locationId}-event-${i}`,
      source: "demo_signal",
      title: names[threat],
      summary: `Synthetic climate signal for ${locationId} generated for GitHub Pages demo mode.`,
      occurred_at: ts.toISOString(),
      severity,
      source_url: "https://github.com/DommLee/ai-climate-platform",
    });
  }
  return rows;
}

function generateRiskFeatures(locationId) {
  const risk = generateRisk(locationId);
  return [
    { feature_name: "temp_anomaly", feature_value: Number((risk.hazard / 25).toFixed(3)), source: "demo_weather", confidence: 0.84 },
    { feature_name: "precip_probability", feature_value: Number((risk.exposure / 33).toFixed(3)), source: "demo_weather", confidence: 0.78 },
    { feature_name: "pm25", feature_value: Number((risk.vulnerability / 31).toFixed(3)), source: "demo_air", confidence: 0.76 },
    { feature_name: "event_intensity", feature_value: Number((risk.probability_30d / 30).toFixed(3)), source: "demo_events", confidence: 0.8 },
  ];
}

function makeInsight(location, lang = "en") {
  const risk = generateRisk(location.id);
  const tr = lang === "tr";
  return {
    provider: "demo",
    model: "synthetic-v1",
    generated_at: nowIso(),
    source_attribution: SOURCE_ATTRIBUTION,
    content: {
      summary: tr
        ? `${location.name} icin demo risk skoru ${risk.overall}/100. Ana tehdit ${risk.primary_threat}.`
        : `Demo risk score for ${location.name} is ${risk.overall}/100 with ${risk.primary_threat} as primary threat.`,
      risk_rationale: tr
        ? "Bu cikti, GitHub Pages uzerinde backend erisimi olmadiginda gosterim amacli demo veri ile uretilmistir."
        : "This output is generated from synthetic demo data for GitHub Pages when backend connectivity is unavailable.",
      recommendations: tr
        ? [
            "Yerel izleme planini 15 dakikalik periyotla surdur.",
            "Saha ekipleri icin kritik kontrol listesini guncelle.",
            "Veri tazelik ve guven skorlarini duzenli denetle.",
          ]
        : [
            "Keep local monitoring on a 15-minute cadence.",
            "Update frontline critical checklists.",
            "Audit data freshness and trust scores regularly.",
          ],
      first_72h_action_plan: tr
        ? ["0-24 saat: Izleme frekansini artir.", "24-48 saat: Kritik kaynak tahsisini tamamla.", "48-72 saat: Risk trendini yeniden degerlendir."]
        : ["0-24h: Increase monitoring cadence.", "24-48h: Complete critical resource allocation.", "48-72h: Re-evaluate risk trend."],
      citations: [
        { source: "demo_dataset", source_url: "https://github.com/DommLee/ai-climate-platform", timestamp_utc: nowIso() },
      ],
    },
  };
}

function makeSnapshot(locationId) {
  const location = resolveLocation(locationId);
  const risk = generateRisk(location.id);
  return {
    location_id: location.id,
    location_name: location.name,
    generated_at: nowIso(),
    current_weather: {
      temperature_c: Number(seeded(`${location.id}:weather:temp`, 4, 33).toFixed(1)),
      humidity_pct: Number(seeded(`${location.id}:weather:hum`, 38, 78).toFixed(0)),
      wind_kmh: Number(seeded(`${location.id}:weather:wind`, 4, 28).toFixed(1)),
    },
    risk,
    source_attribution: SOURCE_ATTRIBUTION,
    license_tag: "demo",
    confidence: risk.confidence,
    uncertainty_band: risk.uncertainty_band,
  };
}

function makeSourceCatalog() {
  return {
    items: [
      {
        id: "open_meteo",
        description: "Global weather observations and forecast",
        license_tag: "CC-BY 4.0",
        freshness_sla_minutes: 15,
        source_url: "https://open-meteo.com/",
      },
      {
        id: "nasa_power",
        description: "Climate baseline indicators",
        license_tag: "NASA Open Data",
        freshness_sla_minutes: 180,
        source_url: "https://power.larc.nasa.gov/",
      },
      {
        id: "reliefweb",
        description: "Humanitarian situation and disaster signals",
        license_tag: "UN OCHA",
        freshness_sla_minutes: 60,
        source_url: "https://reliefweb.int/",
      },
    ],
  };
}

function makeCompliance() {
  return {
    items: [
      { id: "gdpr_min", title: "GDPR data minimization", status: "implemented", evidence: "No personal data persisted in demo mode." },
      { id: "nist_rmf", title: "NIST AI RMF logging", status: "implemented", evidence: "Model and prompt metadata rendered in governance card." },
    ],
  };
}

function makeModelVersions() {
  return {
    prompt_version: "v1",
    primary: { provider: "openai", model: "gpt-4.1-mini" },
    secondary: { provider: "gemini", model: "gemini-1.5-flash" },
  };
}

function makeRankings(limit = 8) {
  return {
    items: DEMO_LOCATIONS.map((location) => {
      const risk = generateRisk(location.id);
      return {
        location_id: location.id,
        location_name: location.name,
        country: location.country,
        overall_score: risk.overall,
        primary_threat: risk.primary_threat,
      };
    })
      .sort((a, b) => b.overall_score - a.overall_score)
      .slice(0, limit),
  };
}

function resolveCountryCode(input) {
  const raw = String(input || "").trim();
  const upper = raw.toUpperCase();
  if (COUNTRY_DATA[upper]) return upper;
  const normalized = raw.toLowerCase();
  return COUNTRY_ALIASES[normalized] || "TUR";
}

function makeCountryProfile(countryRef, lang = "en") {
  const iso3 = resolveCountryCode(countryRef);
  const country = COUNTRY_DATA[iso3] || COUNTRY_DATA.TUR;
  const threat = pickThreat(`${iso3}:threat`);
  const computedRisk = Number(seeded(`${iso3}:risk`, 28, 76).toFixed(1));
  const trendDirection = ["rising", "stable", "falling"][hashString(`${iso3}:trend`) % 3];

  const timeline = Array.from({ length: 8 }).map((_, idx) => {
    const start = new Date(Date.now() - (7 - idx) * 20 * 24 * 60 * 60 * 1000);
    return {
      bucket_start: start.toISOString(),
      signal_count: Math.round(seeded(`${iso3}:signals:${idx}`, 4, 22)),
      high_severity_count: Math.round(seeded(`${iso3}:high:${idx}`, 1, 7)),
      disaster_count: Math.round(seeded(`${iso3}:disaster:${idx}`, 0, 3)),
    };
  });

  const macroMetrics = [
    { label: "Renewable energy share", indicator_id: "EG.FEC.RNEW.ZS", value: Number(seeded(`${iso3}:ren`, 9, 48).toFixed(2)), unit: "%", year: 2024, benchmark_value: 27.8, delta_pct_vs_benchmark: Number(seeded(`${iso3}:ren:delta`, -28, 34).toFixed(1)) },
    { label: "CO2 emissions per capita", indicator_id: "EN.ATM.CO2E.PC", value: Number(seeded(`${iso3}:co2`, 1.4, 14.2).toFixed(2)), unit: "t", year: 2023, benchmark_value: 4.7, delta_pct_vs_benchmark: Number(seeded(`${iso3}:co2:delta`, -38, 52).toFixed(1)) },
    { label: "Forest area", indicator_id: "AG.LND.FRST.ZS", value: Number(seeded(`${iso3}:forest`, 10, 64).toFixed(2)), unit: "%", year: 2023, benchmark_value: 31.1, delta_pct_vs_benchmark: Number(seeded(`${iso3}:forest:delta`, -29, 26).toFixed(1)) },
    { label: "GDP per capita", indicator_id: "NY.GDP.PCAP.CD", value: Number(seeded(`${iso3}:gdp`, 4000, 75000).toFixed(0)), unit: "USD", year: 2024, benchmark_value: 13200, delta_pct_vs_benchmark: Number(seeded(`${iso3}:gdp:delta`, -42, 180).toFixed(1)) },
  ];

  const resilience = {
    overall_resilience_score: Number(seeded(`${iso3}:res`, 38, 86).toFixed(1)),
    adaptation_readiness_score: Number(seeded(`${iso3}:adapt`, 35, 88).toFixed(1)),
    climate_pressure_score: Number(seeded(`${iso3}:pressure`, 30, 84).toFixed(1)),
    narrative:
      lang === "tr"
        ? "Skorlar demo modunda hesaplanmistir; gercek uygulamada canli kaynaklarla guncellenir."
        : "Scores are synthetic in demo mode and are refreshed from live sources in production.",
    dimensions: [
      { name: lang === "tr" ? "Hazirlik" : "Preparedness", score: Number(seeded(`${iso3}:d1`, 35, 90).toFixed(1)), narrative: lang === "tr" ? "Kurumsal hazirlik seviyesi" : "Institutional readiness level" },
      { name: lang === "tr" ? "Altyapi" : "Infrastructure", score: Number(seeded(`${iso3}:d2`, 34, 88).toFixed(1)), narrative: lang === "tr" ? "Kritik altyapi dayanimi" : "Critical infrastructure robustness" },
      { name: lang === "tr" ? "Sosyal Kapsam" : "Social Coverage", score: Number(seeded(`${iso3}:d3`, 33, 87).toFixed(1)), narrative: lang === "tr" ? "Toplumsal uyum kapasitesi" : "Community adaptation capacity" },
    ],
  };

  const recs = lang === "tr"
    ? [
        "Erken uyari protokollerini bolgesel tehdit profiline gore guncelle.",
        "Yuksek sinyal alanlarinda saha dogrulama frekansini artir.",
        "Su, enerji ve saglik hizmetleri icin 72 saatlik rezerv kapasite planla.",
      ]
    : [
        "Update early-warning protocols for regional threat profile.",
        "Increase field validation cadence in high-signal districts.",
        "Plan 72-hour reserve capacity for water, energy, and health services.",
      ];

  return {
    ...country,
    iso3,
    signal_summary: {
      lookback_days: 180,
      total_signals: Math.round(seeded(`${iso3}:totalSignals`, 28, 140)),
      primary_threat: threat,
      computed_risk_score: computedRisk,
    },
    historical_summary: {
      trend_direction: trendDirection,
      timeline,
      top_threats: THREATS.map((item, idx) => ({ threat: item, count: Math.round(seeded(`${iso3}:top:${idx}`, 4, 20)) })),
    },
    insight: {
      content: {
        summary: lang === "tr" ? `${country.country_name} icin risk ozeti demo veriyle uretildi.` : `Risk summary for ${country.country_name} is generated from demo data.`,
        risk_rationale: lang === "tr" ? "Bu profil GitHub Pages offline demo modundan beslenir." : "This profile is powered by GitHub Pages offline demo mode.",
        recommendations: recs,
        citations: [{ source: "demo_dataset", source_url: "https://github.com/DommLee/ai-climate-platform", timestamp_utc: nowIso() }],
      },
    },
    narrative: {
      executive_brief: lang === "tr" ? `${country.country_name} icin operasyonel risk seviyesi ${computedRisk}/100.` : `Operational risk level for ${country.country_name} is ${computedRisk}/100.`,
      climate_context: lang === "tr" ? "Trend ve sinyal yogunlugu birlesik olarak degerlendirildi." : "Trend and signal intensity were evaluated jointly.",
      sustainability_context: lang === "tr" ? "Surdurulebilirlik metrikleri dunya benchmark degerleriyle kiyaslandi." : "Sustainability indicators are benchmarked against global values.",
      watch_items_30d: recs,
      action_tracks_90d: recs,
    },
    macro_metrics: macroMetrics,
    resilience_scorecard: resilience,
    recent_signals: generateEvents(iso3.toLowerCase()).map((item) => ({
      ...item,
      source: item.source,
    })),
  };
}

function parseRequest(config) {
  const method = String(config?.method || "get").toLowerCase();
  const rawUrl = String(config?.url || "");
  const url = rawUrl.startsWith("http") ? new URL(rawUrl) : new URL(rawUrl, "https://example.com");
  return {
    method,
    pathname: url.pathname,
    params: config?.params || {},
    data: config?.data,
  };
}

function parseJson(value) {
  if (!value) return {};
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

export function resolveMockResponse(config) {
  const req = parseRequest(config);

  if (req.method === "get" && req.pathname === "/api/v1/locations") {
    return DEMO_LOCATIONS;
  }

  if (req.method === "get" && req.pathname === "/api/v1/sources") {
    return makeSourceCatalog();
  }

  if (req.method === "get" && req.pathname === "/api/v1/compliance/checklist") {
    return makeCompliance();
  }

  if (req.method === "get" && req.pathname === "/api/v1/governance/model-versions") {
    return makeModelVersions();
  }

  if (req.method === "get" && req.pathname === "/api/v1/locations/rankings") {
    return makeRankings(Number(req.params?.limit || 8));
  }

  const locationMatch = req.pathname.match(/^\/api\/v1\/locations\/([^/]+)\/(snapshot|risks|risk-features|events|timeseries|insights)$/);
  if (req.method === "get" && locationMatch) {
    const locationId = decodeURIComponent(locationMatch[1]);
    const resource = locationMatch[2];
    const location = resolveLocation(locationId);

    if (resource === "snapshot") return makeSnapshot(location.id);
    if (resource === "risks") return { latest: generateRisk(location.id), history: generateHistory(location.id) };
    if (resource === "risk-features") return { items: generateRiskFeatures(location.id) };
    if (resource === "events") return { items: generateEvents(location.id) };
    if (resource === "timeseries") return { points: generateForecast(location.id) };
    if (resource === "insights") return makeInsight(location, req.params?.lang || "en");
  }

  const countryMatch = req.pathname.match(/^\/api\/v1\/countries\/([^/]+)\/profile$/);
  if (req.method === "get" && countryMatch) {
    const countryRef = decodeURIComponent(countryMatch[1]);
    return makeCountryProfile(countryRef, req.params?.lang || "en");
  }

  if (req.method === "post" && req.pathname === "/api/v1/feedback") {
    return { status: "saved", mode: "demo" };
  }

  if (req.method === "post" && req.pathname === "/api/v1/reports") {
    const body = parseJson(req.data);
    const reportId = `demo-report-${hashString(`${body?.location_id || "location"}-${Date.now()}`)}`;
    const report = {
      id: reportId,
      status: "completed",
      output_url: "",
      duration_seconds: 0.8,
      mode: "demo",
    };
    REPORT_STORE.set(reportId, report);
    return report;
  }

  const reportMatch = req.pathname.match(/^\/api\/v1\/reports\/([^/]+)$/);
  if (req.method === "get" && reportMatch) {
    const reportId = decodeURIComponent(reportMatch[1]);
    return REPORT_STORE.get(reportId) || { id: reportId, status: "completed", output_url: "", duration_seconds: 0.8, mode: "demo" };
  }

  return null;
}

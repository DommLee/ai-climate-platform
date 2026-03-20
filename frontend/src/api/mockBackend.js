import countriesBaseline from "../data/countriesBaseline.json";
import demoLocations from "../data/demoLocations.json";

const DEMO_LOCATIONS = Array.isArray(demoLocations) ? demoLocations : [];

function normalizeAliasKey(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase();
}

function buildCountryLookups() {
  const countryData = {};
  const countryAliases = {};
  const countryIso2ToIso3 = {};

  countriesBaseline.forEach((entry) => {
    const iso3 = String(entry?.cca3 || "").trim().toUpperCase();
    if (!iso3 || iso3.length !== 3) return;

    countryData[iso3] = {
      iso2: String(entry?.cca2 || "").trim().toUpperCase() || null,
      iso3,
      country_name: String(entry?.name_common || iso3),
      region: String(entry?.region || "Global"),
      capital: String(entry?.capital || "-"),
      population: Number.isFinite(Number(entry?.population)) ? Number(entry.population) : null,
      area_km2: Number.isFinite(Number(entry?.area_km2)) ? Number(entry.area_km2) : null,
      lat: Number.isFinite(Number(entry?.lat)) ? Number(entry.lat) : null,
      lon: Number.isFinite(Number(entry?.lon)) ? Number(entry.lon) : null,
    };

    const iso2 = String(entry?.cca2 || "").trim().toUpperCase();
    if (iso2 && iso2.length === 2) {
      countryIso2ToIso3[iso2] = iso3;
    }

    const aliasCandidates = [entry?.name_common, entry?.name_official, iso3, iso2, ...(entry?.alt_spellings || [])];
    aliasCandidates.forEach((candidate) => {
      const key = normalizeAliasKey(candidate);
      if (!key || countryAliases[key]) return;
      countryAliases[key] = iso3;
    });
  });

  return { countryData, countryAliases, countryIso2ToIso3 };
}

const { countryData: COUNTRY_DATA, countryAliases: COUNTRY_ALIASES, countryIso2ToIso3: COUNTRY_ISO2_TO_ISO3 } = buildCountryLookups();

const MANUAL_COUNTRY_ALIASES = {
  turkiye: "TUR",
  "turkiye cumhuriyeti": "TUR",
  abd: "USA",
  amerika: "USA",
  "birlesik devletler": "USA",
  "united states": "USA",
  "united states of america": "USA",
  afganistan: "AFG",
  afkanistan: "AFG",
  kazakistan: "KAZ",
  ingiltere: "GBR",
  "birlesik krallik": "GBR",
  uae: "ARE",
};

Object.entries(MANUAL_COUNTRY_ALIASES).forEach(([alias, iso3]) => {
  COUNTRY_ALIASES[normalizeAliasKey(alias)] = iso3;
});

const THREATS = ["drought", "flood", "wildfire", "heatwave"];
const EXCLUDED_COUNTRY_ISO3 = new Set(["BMU"]);
const SOURCE_ATTRIBUTION = [
  { source: "open_meteo", freshness_minutes: 35, trust_score: 0.92 },
  { source: "nasa_power", freshness_minutes: 240, trust_score: 0.89 },
  { source: "reliefweb", freshness_minutes: 180, trust_score: 0.86 },
];

const REPORT_STORE = new Map();
const LIVE_COUNTRY_PROFILE_CACHE = new Map();
const LIVE_LOCATION_WEATHER_CACHE = new Map();
const LIVE_WORLD_BANK_BENCHMARK_CACHE = new Map();

const COUNTRY_PROFILE_LIVE_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const LOCATION_WEATHER_CACHE_TTL_MS = 15 * 60 * 1000;
const WORLD_BENCHMARK_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const LIVE_INDICATORS = [
  { id: "EG.FEC.RNEW.ZS", label: "Renewable energy share", unit: "%" },
  { id: "EN.ATM.CO2E.PC", label: "CO2 emissions per capita", unit: "t" },
  { id: "AG.LND.FRST.ZS", label: "Forest area", unit: "%" },
  { id: "NY.GDP.PCAP.CD", label: "GDP per capita", unit: "USD" },
];

function toFiniteOrNull(value, digits = null) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  if (digits === null) return numeric;
  return Number(numeric.toFixed(digits));
}

async function fetchJsonWithTimeout(url, { timeoutMs = 14000, headers = {} } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        ...headers,
      },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function pickLatestWorldBankValue(payload) {
  const rows = Array.isArray(payload?.[1]) ? payload[1] : [];
  const latest = rows.find((row) => row && row.value !== null && row.value !== undefined);
  if (!latest) return { value: null, year: null };
  return {
    value: toFiniteOrNull(latest.value),
    year: Number.isFinite(Number(latest.date)) ? Number(latest.date) : null,
  };
}

async function fetchWorldBankIndicator(countryCode, indicatorId) {
  const target = String(countryCode || "").trim().toLowerCase();
  const url = `https://api.worldbank.org/v2/country/${encodeURIComponent(target)}/indicator/${encodeURIComponent(indicatorId)}?format=json&per_page=70`;
  const payload = await fetchJsonWithTimeout(url);
  return pickLatestWorldBankValue(payload);
}

async function fetchWorldBankBenchmark(indicatorId) {
  const cached = LIVE_WORLD_BANK_BENCHMARK_CACHE.get(indicatorId);
  if (cached && Date.now() - cached.cachedAt < WORLD_BENCHMARK_CACHE_TTL_MS) {
    return cached.value;
  }
  const latest = await fetchWorldBankIndicator("WLD", indicatorId);
  LIVE_WORLD_BANK_BENCHMARK_CACHE.set(indicatorId, { cachedAt: Date.now(), value: latest.value });
  return latest.value;
}

async function fetchCountryMetaLive(iso3, countryRef) {
  const normalizedIso3 = String(iso3 || "").trim().toUpperCase();
  if (normalizedIso3.length !== 3) return null;

  const alphaUrl = `https://restcountries.com/v3.1/alpha/${encodeURIComponent(normalizedIso3)}?fields=cca2,cca3,name,capital,region,subregion,population,area,latlng`;
  try {
    const alphaPayload = await fetchJsonWithTimeout(alphaUrl);
    const row = Array.isArray(alphaPayload) ? alphaPayload[0] : alphaPayload;
    if (row && row.cca3) return row;
  } catch {
    // Fallback to name endpoint below
  }

  const rawName = String(countryRef || "").trim();
  if (!rawName || /^[A-Za-z]{2,3}$/.test(rawName)) return null;
  const nameUrl = `https://restcountries.com/v3.1/name/${encodeURIComponent(rawName)}?fullText=false&fields=cca2,cca3,name,capital,region,subregion,population,area,latlng`;
  const byName = await fetchJsonWithTimeout(nameUrl);
  const matched = Array.isArray(byName) ? byName.find((item) => String(item?.cca3 || "").toUpperCase() === normalizedIso3) || byName[0] : null;
  return matched || null;
}

async function fetchMacroMetricsLive(countryCode) {
  const code = String(countryCode || "").trim();
  if (!code) return [];

  const items = await Promise.all(
    LIVE_INDICATORS.map(async (indicator) => {
      const [countryMetric, benchmarkValue] = await Promise.all([
        fetchWorldBankIndicator(code, indicator.id),
        fetchWorldBankBenchmark(indicator.id),
      ]);

      const metricValue = toFiniteOrNull(countryMetric.value, 2);
      const worldValue = toFiniteOrNull(benchmarkValue, 2);
      const delta =
        metricValue === null || worldValue === null || worldValue === 0
          ? null
          : toFiniteOrNull(((metricValue - worldValue) / Math.abs(worldValue)) * 100, 1);

      return {
        label: indicator.label,
        indicator_id: indicator.id,
        value: metricValue,
        unit: indicator.unit,
        year: countryMetric.year,
        benchmark_value: worldValue,
        delta_pct_vs_benchmark: delta,
      };
    }),
  );

  return items;
}

async function fetchLocationWeatherLive(location) {
  if (!location?.id) return null;
  const cached = LIVE_LOCATION_WEATHER_CACHE.get(location.id);
  if (cached && Date.now() - cached.cachedAt < LOCATION_WEATHER_CACHE_TTL_MS) {
    return cached.data;
  }

  const url = `https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(location.lat)}&longitude=${encodeURIComponent(
    location.lon,
  )}&current=temperature_2m,relative_humidity_2m,wind_speed_10m&hourly=temperature_2m&forecast_days=3&timezone=UTC`;
  const payload = await fetchJsonWithTimeout(url);

  const current = payload?.current || {};
  const hourlyTimes = Array.isArray(payload?.hourly?.time) ? payload.hourly.time : [];
  const hourlyTemps = Array.isArray(payload?.hourly?.temperature_2m) ? payload.hourly.temperature_2m : [];
  const forecastPoints = hourlyTimes.slice(0, 18).map((timestamp, index) => ({
    timestamp,
    value: toFiniteOrNull(hourlyTemps[index], 2),
  }));

  const weatherData = {
    current_weather: {
      temperature_c: toFiniteOrNull(current.temperature_2m, 1),
      humidity_pct: toFiniteOrNull(current.relative_humidity_2m, 0),
      wind_kmh: toFiniteOrNull(current.wind_speed_10m, 1),
    },
    forecast_points: forecastPoints.filter((item) => item.value !== null),
  };

  LIVE_LOCATION_WEATHER_CACHE.set(location.id, { cachedAt: Date.now(), data: weatherData });
  return weatherData;
}

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
    primary: { provider: "groq", model: "llama-3.3-70b-versatile" },
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

function getCountryMetaByIso3(iso3) {
  const normalized = String(iso3 || "").trim().toUpperCase();
  const item = COUNTRY_DATA[normalized];
  if (item) return item;
  return null;
}

function makeCountriesCatalog() {
  const grouped = new Map();
  DEMO_LOCATIONS.forEach((location) => {
    const iso2 = String(location?.country || "").toUpperCase();
    if (!iso2) return;
    const iso3 = COUNTRY_ISO2_TO_ISO3[iso2] || iso2;
    if (EXCLUDED_COUNTRY_ISO3.has(iso3)) return;
    const existing = grouped.get(iso3) || { iso2, iso3, country_name: iso3, city_count: 0 };
    const liveCountry = getCountryMetaByIso3(iso3);
    existing.country_name = liveCountry?.country_name || existing.country_name;
    existing.city_count += 1;
    grouped.set(iso3, existing);
  });

  const items = [...grouped.values()].sort((a, b) => String(a.country_name).localeCompare(String(b.country_name), "en"));
  return { generated_at: nowIso(), items };
}

function makeCountryCities(countryRef) {
  const iso3 = resolveCountryCode(countryRef);
  if (EXCLUDED_COUNTRY_ISO3.has(iso3)) {
    return {
      generated_at: nowIso(),
      iso2: null,
      iso3,
      country_name: iso3,
      items: [],
    };
  }

  const countryMeta = getCountryMetaByIso3(iso3);
  const iso2 = String(countryMeta?.iso2 || "").toUpperCase() || null;
  const items = DEMO_LOCATIONS.filter((item) => {
    if (!iso2) return resolveCountryCode(item.country) === iso3;
    return String(item.country || "").toUpperCase() === iso2;
  }).sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "en"));

  return {
    generated_at: nowIso(),
    iso2,
    iso3,
    country_name: countryMeta?.country_name || iso3,
    items,
  };
}

function makeSystemStatus() {
  return {
    generated_at: nowIso(),
    mode: "DEMO",
    fallback_enabled: true,
    llm_primary_provider: "groq",
    llm_secondary_provider: "gemini",
    providers: [
      { provider: "groq", configured: false, model: "llama-3.3-70b-versatile" },
      { provider: "gemini", configured: false, model: "gemini-1.5-flash" },
      { provider: "openai", configured: false, model: "gpt-4.1-mini" },
    ],
    excluded_country_iso3: [...EXCLUDED_COUNTRY_ISO3],
    location_count: DEMO_LOCATIONS.length,
  };
}

function makeOpportunities(lang = "tr") {
  const items =
    lang === "tr"
      ? [
          {
            id: "opp-reliefweb-demo",
            title: "ReliefWeb Iklim Cagrilari",
            organization: "ReliefWeb",
            summary: "Canli cagri akisina ulasilamadiginda bu kart fallback olarak gorunur. Sistem canli kaynaga otomatik geri dener.",
            source_url: "https://reliefweb.int/updates?search=climate%20funding&format=rss",
            source: "reliefweb",
            published_at: nowIso(),
            tags: ["iklim", "hibe", "program"],
          },
          {
            id: "opp-worldbank-demo",
            title: "World Bank Climate Programs",
            organization: "World Bank",
            summary: "Surdurulebilirlik odakli fon ve program duyurulari bu alanda listelenir.",
            source_url: "https://www.worldbank.org/en/topic/climatechange",
            source: "world_bank",
            published_at: nowIso(),
            tags: ["climate", "funding"],
          },
        ]
      : [
          {
            id: "opp-reliefweb-demo",
            title: "ReliefWeb Climate Calls",
            organization: "ReliefWeb",
            summary: "When live feeds are unavailable this card is shown as transparent fallback while automatic retries continue.",
            source_url: "https://reliefweb.int/updates?search=climate%20funding&format=rss",
            source: "reliefweb",
            published_at: nowIso(),
            tags: ["climate", "grant", "program"],
          },
          {
            id: "opp-worldbank-demo",
            title: "World Bank Climate Programs",
            organization: "World Bank",
            summary: "Sustainability-focused funding and program notices are listed in this stream.",
            source_url: "https://www.worldbank.org/en/topic/climatechange",
            source: "world_bank",
            published_at: nowIso(),
            tags: ["climate", "funding"],
          },
        ];
  return { generated_at: nowIso(), items };
}

function toTitleCase(value) {
  return String(value || "")
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1).toLowerCase())
    .join(" ");
}

function resolveCountryCode(input) {
  const raw = String(input || "").trim();
  const upper = raw.toUpperCase();

  if (upper.length === 2 && COUNTRY_ISO2_TO_ISO3[upper]) return COUNTRY_ISO2_TO_ISO3[upper];
  if (COUNTRY_DATA[upper]) return upper;

  if (/^[A-Z]{3}$/.test(upper)) return upper;

  const normalized = normalizeAliasKey(raw);
  if (COUNTRY_ALIASES[normalized]) return COUNTRY_ALIASES[normalized];

  return "UNK";
}

function buildFallbackCountry(iso3, countryRef) {
  const raw = String(countryRef || "").trim();
  const prettyFromRef = raw && !/^[A-Z]{2,3}$/.test(raw.toUpperCase()) ? toTitleCase(raw) : null;
  const countryName = prettyFromRef || iso3;
  return {
    country_name: countryName,
    region: null,
    capital: "-",
    population: null,
    area_km2: null,
    lat: null,
    lon: null,
  };
}

function makeCountryProfile(countryRef, lang = "en") {
  const iso3 = resolveCountryCode(countryRef);
  const country = COUNTRY_DATA[iso3] || buildFallbackCountry(iso3, countryRef);
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

async function makeCountryProfileLive(countryRef, lang = "en") {
  const iso3 = resolveCountryCode(countryRef);
  const cacheKey = `${iso3}:${lang}`;
  const cached = LIVE_COUNTRY_PROFILE_CACHE.get(cacheKey);
  if (cached && Date.now() - cached.cachedAt < COUNTRY_PROFILE_LIVE_CACHE_TTL_MS) {
    return cached.data;
  }

  const profile = makeCountryProfile(countryRef, lang);

  try {
    const liveMeta = await fetchCountryMetaLive(iso3, countryRef);
    if (liveMeta) {
      const liveIso3 = String(liveMeta?.cca3 || iso3).toUpperCase();
      if (iso3 && iso3 !== "UNK" && liveIso3 && liveIso3 !== iso3) {
        LIVE_COUNTRY_PROFILE_CACHE.set(cacheKey, { cachedAt: Date.now(), data: profile });
        return profile;
      }
      profile.iso3 = liveIso3;
      profile.country_name = String(liveMeta?.name?.common || profile.country_name || liveIso3);
      profile.region = String(liveMeta?.subregion || liveMeta?.region || profile.region || "Global");
      profile.capital = String((Array.isArray(liveMeta?.capital) && liveMeta.capital[0]) || profile.capital || "-");
      profile.population = toFiniteOrNull(liveMeta?.population, 0) ?? profile.population;
      profile.area_km2 = toFiniteOrNull(liveMeta?.area, 0) ?? profile.area_km2;
      profile.lat = toFiniteOrNull(liveMeta?.latlng?.[0], 2) ?? profile.lat;
      profile.lon = toFiniteOrNull(liveMeta?.latlng?.[1], 2) ?? profile.lon;

      const worldBankCountryCode = String(liveMeta?.cca2 || liveIso3 || "").toLowerCase();
      if (worldBankCountryCode) {
        const [liveMetrics, livePopulation, liveArea] = await Promise.all([
          fetchMacroMetricsLive(worldBankCountryCode),
          fetchWorldBankIndicator(worldBankCountryCode, "SP.POP.TOTL"),
          fetchWorldBankIndicator(worldBankCountryCode, "AG.SRF.TOTL.K2"),
        ]);
        if (liveMetrics.length) {
          profile.macro_metrics = liveMetrics;
        }
        const populationValue = toFiniteOrNull(livePopulation?.value, 0);
        const areaValue = toFiniteOrNull(liveArea?.value, 2);

        const baselinePopulation = toFiniteOrNull(profile.population, 0);
        const baselineArea = toFiniteOrNull(profile.area_km2, 2);

        const populationTrustworthy =
          populationValue !== null &&
          (baselinePopulation === null ||
            baselinePopulation === 0 ||
            (populationValue / baselinePopulation >= 0.2 && populationValue / baselinePopulation <= 5));
        const areaTrustworthy =
          areaValue !== null &&
          (baselineArea === null || baselineArea === 0 || (areaValue / baselineArea >= 0.2 && areaValue / baselineArea <= 5));

        if (populationTrustworthy) profile.population = populationValue;
        if (areaTrustworthy) profile.area_km2 = areaValue;
      }
    }
  } catch {
    // API errors should not break the UI in demo mode.
  }

  LIVE_COUNTRY_PROFILE_CACHE.set(cacheKey, { cachedAt: Date.now(), data: profile });
  return profile;
}

function parseRequest(config) {
  const method = String(config?.method || "get").toLowerCase();
  const rawUrl = String(config?.url || "");
  const url = rawUrl.startsWith("http") ? new URL(rawUrl) : new URL(rawUrl, "https://example.com");
  const normalizedPathname = String(url.pathname || "/").replace(/\/+$/, "") || "/";
  const apiStartIndex = normalizedPathname.toLowerCase().indexOf("/api/v1/");
  const apiPath = apiStartIndex >= 0 ? normalizedPathname.slice(apiStartIndex) : normalizedPathname;
  return {
    method,
    pathname: apiPath,
    raw_pathname: normalizedPathname,
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

export async function resolveMockResponse(config) {
  const req = parseRequest(config);

  if (req.method === "get" && req.pathname === "/api/v1/system/status") {
    return makeSystemStatus();
  }

  if (req.method === "get" && req.pathname === "/api/v1/countries") {
    return makeCountriesCatalog();
  }

  const countryCitiesMatch = req.pathname.match(/^\/api\/v1\/countries\/([^/]+)\/cities$/);
  if (req.method === "get" && countryCitiesMatch) {
    const countryRef = decodeURIComponent(countryCitiesMatch[1]);
    return makeCountryCities(countryRef);
  }

  if (req.method === "get" && req.pathname === "/api/v1/opportunities") {
    return makeOpportunities(req.params?.lang || "tr");
  }

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

    if (resource === "snapshot") {
      const snapshot = makeSnapshot(location.id);
      try {
        const liveWeather = await fetchLocationWeatherLive(location);
        if (liveWeather?.current_weather) {
          snapshot.current_weather = {
            temperature_c: liveWeather.current_weather.temperature_c ?? snapshot.current_weather.temperature_c,
            humidity_pct: liveWeather.current_weather.humidity_pct ?? snapshot.current_weather.humidity_pct,
            wind_kmh: liveWeather.current_weather.wind_kmh ?? snapshot.current_weather.wind_kmh,
          };
          snapshot.generated_at = nowIso();
        }
      } catch {
        // Keep synthetic fallback when public weather API is unavailable.
      }
      return snapshot;
    }
    if (resource === "risks") return { latest: generateRisk(location.id), history: generateHistory(location.id) };
    if (resource === "risk-features") return { items: generateRiskFeatures(location.id) };
    if (resource === "events") return { items: generateEvents(location.id) };
    if (resource === "timeseries") {
      try {
        const liveWeather = await fetchLocationWeatherLive(location);
        if (Array.isArray(liveWeather?.forecast_points) && liveWeather.forecast_points.length) {
          return { points: liveWeather.forecast_points };
        }
      } catch {
        // Keep synthetic fallback when public weather API is unavailable.
      }
      return { points: generateForecast(location.id) };
    }
    if (resource === "insights") return makeInsight(location, req.params?.lang || "en");
  }

  const countryMatch = req.pathname.match(/^\/api\/v1\/countries\/([^/]+)\/profile$/);
  if (req.method === "get" && countryMatch) {
    const countryRef = decodeURIComponent(countryMatch[1]);
    return await makeCountryProfileLive(countryRef, req.params?.lang || "en");
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

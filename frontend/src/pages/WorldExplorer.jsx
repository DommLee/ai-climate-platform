import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Globe from "react-globe.gl";
import { LoaderCircle, Search } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, Tooltip, XAxis, YAxis } from "recharts";
import { useLocation } from "react-router-dom";
import { api } from "../api/client";
import { useClimate } from "../context/ClimateContext";
import { useI18n } from "../context/I18nContext";
import SafeResponsiveChart from "../components/SafeResponsiveChart";
import countriesBaseline from "../data/countriesBaseline.json";
import worldCountriesGeo from "../data/worldCountries.json";

const COUNTRIES_GEOJSON_REMOTE_URL = "https://raw.githubusercontent.com/johan/world.geo.json/master/countries.geo.json";
const COUNTRIES_GEOJSON_REMOTE_FALLBACK_URL = "https://cdn.jsdelivr.net/gh/johan/world.geo.json@master/countries.geo.json";
const EARTH_TEXTURE_URL = "https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg";
const EARTH_BUMP_URL = "https://unpkg.com/three-globe/example/img/earth-topology.png";
const DEFAULT_EXCLUDED_COUNTRY_ISO3 = new Set(["BMU"]);
const LARGE_COUNTRY_ISO3 = new Set(["RUS", "CAN", "USA", "CHN", "BRA", "AUS", "IND", "ARG", "DZA", "SAU"]);
const MANUALLY_EXCLUDED_COUNTRY_NAME_TOKENS = ["bermuda"];
const COUNTRY_PROFILE_CACHE_TTL_MS = 10 * 60 * 1000;
const COUNTRY_REQUEST_TIMEOUT_MS = 35000;
const COUNTRY_RETRY_DELAY_MS = 450;
const COUNTRY_NAME_TO_ISO3_ALIASES = {
  turkiye: "TUR",
  turkey: "TUR",
  "turkiye cumhuriyeti": "TUR",
  "united states": "USA",
  "united states of america": "USA",
  usa: "USA",
  abd: "USA",
  uk: "GBR",
  "united kingdom": "GBR",
  "great britain": "GBR",
};

const COUNTRY_NAME_ALIASES = {
  "u.s.a": "USA",
  england: "GBR",
  scotland: "GBR",
  wales: "GBR",
  russia: "RUS",
  "south korea": "KOR",
  "north korea": "PRK",
};

function buildCountryNameToIso3Map() {
  const map = new Map();
  (countriesBaseline || []).forEach((entry) => {
    const iso3 = normalizeIso3(entry?.cca3);
    if (!iso3 || iso3.length !== 3) return;
    const candidates = [entry?.name_common, entry?.name_official, ...(Array.isArray(entry?.alt_spellings) ? entry.alt_spellings : [])];
    candidates.forEach((candidate) => {
      const normalized = normalizeCountryName(candidate);
      if (!normalized || map.has(normalized)) return;
      map.set(normalized, iso3);
    });
  });
  Object.entries(COUNTRY_NAME_TO_ISO3_ALIASES).forEach(([alias, iso3]) => {
    const normalizedAlias = normalizeCountryName(alias);
    const normalizedIso3 = normalizeIso3(iso3);
    if (normalizedAlias && normalizedIso3.length === 3) map.set(normalizedAlias, normalizedIso3);
  });
  return map;
}

const COUNTRY_NAME_TO_ISO3 = buildCountryNameToIso3Map();

function formatNumber(value) {
  if (value === null || value === undefined) return "-";
  return new Intl.NumberFormat().format(value);
}

function normalizeIso3(value) {
  return String(value || "")
    .trim()
    .toUpperCase();
}

function normalizeIsoCandidate(value) {
  const iso = normalizeIso3(value);
  if (iso.length !== 3) return "";
  if (!/^[A-Z0-9]{3}$/.test(iso)) return "";
  if (iso === "-99") return "";
  return iso;
}

function isoFromFeatureName(feature) {
  const normalizedName = normalizeCountryName(feature?.properties?.name);
  if (!normalizedName) return "";
  return normalizeIsoCandidate(COUNTRY_NAME_TO_ISO3.get(normalizedName));
}

function featureIso3(feature) {
  const geometryCandidates = [
    feature?.properties?.iso_a3,
    feature?.properties?.ISO_A3,
    feature?.properties?.adm0_a3,
    feature?.properties?.ADM0_A3,
    feature?.id,
  ]
    .map((item) => normalizeIsoCandidate(item))
    .filter(Boolean);
  const isoFromName = isoFromFeatureName(feature);
  if (geometryCandidates.length) return geometryCandidates[0];
  return isoFromName || "";
}

function featureIsoCandidates(feature) {
  const isoCandidates = [
    feature?.properties?.iso_a3,
    feature?.properties?.ISO_A3,
    feature?.properties?.adm0_a3,
    feature?.properties?.ADM0_A3,
    feature?.id,
  ]
    .map((item) => normalizeIsoCandidate(item))
    .filter(Boolean);
  const isoFromName = isoFromFeatureName(feature);
  if (isoFromName && !isoCandidates.includes(isoFromName)) isoCandidates.push(isoFromName);
  return isoCandidates;
}

function normalizeCountryName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function collectCoordinates(node, output) {
  if (!Array.isArray(node)) return;
  if (node.length >= 2 && typeof node[0] === "number" && typeof node[1] === "number") {
    output.push([Number(node[0]), Number(node[1])]);
    return;
  }
  node.forEach((item) => collectCoordinates(item, output));
}

function isAnomalousGeometry(feature) {
  const points = [];
  collectCoordinates(feature?.geometry?.coordinates, points);
  if (points.length < 3) return true;

  let minLon = Infinity;
  let maxLon = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;

  points.forEach(([lon, lat]) => {
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) return;
    minLon = Math.min(minLon, lon);
    maxLon = Math.max(maxLon, lon);
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
  });

  if (!Number.isFinite(minLon) || !Number.isFinite(maxLon) || !Number.isFinite(minLat) || !Number.isFinite(maxLat)) return true;
  const lonSpan = maxLon - minLon;
  const latSpan = maxLat - minLat;
  const bboxArea = lonSpan * latSpan;
  const iso3 = featureIso3(feature);
  if (latSpan > 170 || lonSpan > 330) return true;
  if (bboxArea > 20000 && !LARGE_COUNTRY_ISO3.has(iso3)) return true;
  return false;
}

function isExcludedCountryFeature(feature, excludedIso3) {
  const isoCandidates = featureIsoCandidates(feature);
  const normalizedName = normalizeCountryName(feature?.properties?.name);
  if (isoCandidates.some((item) => excludedIso3.has(item))) return true;
  if (normalizedName && MANUALLY_EXCLUDED_COUNTRY_NAME_TOKENS.some((token) => normalizedName.includes(token))) return true;
  if (isAnomalousGeometry(feature)) return true;
  return false;
}

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function formatThreatLabel(value) {
  return String(value || "climate_stress")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function cleanText(value) {
  const raw = String(value || "");
  const withoutTags = raw.replace(/<[^>]+>/g, " ");
  if (typeof document === "undefined") return withoutTags.replace(/\s+/g, " ").trim();
  const decoder = document.createElement("textarea");
  decoder.innerHTML = withoutTags;
  return decoder.value.replace(/\s+/g, " ").trim();
}

function formatMetricValue(metric) {
  const value = metric?.value;
  if (value === null || value === undefined) return "-";
  if (Math.abs(value) >= 10000) return `${new Intl.NumberFormat().format(Math.round(value))}${metric?.unit ? ` ${metric.unit}` : ""}`;
  return `${value.toFixed(2)}${metric?.unit ? ` ${metric.unit}` : ""}`;
}

function formatSignedPercent(value) {
  if (value === null || value === undefined) return "-";
  if (value > 0) return `+${value.toFixed(1)}%`;
  return `${value.toFixed(1)}%`;
}

function scoreTone(score) {
  if (score >= 70) return "text-emerald-300";
  if (score >= 45) return "text-amber-300";
  return "text-red-300";
}

export default function WorldExplorer() {
  const { lang, t } = useI18n();
  const { systemStatus } = useClimate();
  const routeLocation = useLocation();
  const globeRef = useRef(null);
  const globeContainerRef = useRef(null);
  const activeRequestRef = useRef(0);
  const activeAbortRef = useRef(null);
  const autoLoadedCountryRef = useRef("");
  const profileCacheRef = useRef(new Map());
  const [countries, setCountries] = useState([]);
  const [selectedCountry, setSelectedCountry] = useState(null);
  const [countryProfile, setCountryProfile] = useState(null);
  const [countryQuery, setCountryQuery] = useState("");
  const [geoLoading, setGeoLoading] = useState(true);
  const [globeSize, setGlobeSize] = useState({ width: 0, height: 0 });
  const [profileLoading, setProfileLoading] = useState(false);
  const [error, setError] = useState(null);
  const excludedIso3 = useMemo(() => {
    const values = [...DEFAULT_EXCLUDED_COUNTRY_ISO3];
    const dynamicValues = Array.isArray(systemStatus?.excluded_country_iso3) ? systemStatus.excluded_country_iso3 : [];
    dynamicValues.forEach((item) => values.push(normalizeIso3(item)));
    return new Set(values.filter(Boolean));
  }, [systemStatus]);

  useEffect(() => {
    let mounted = true;
    setGeoLoading(true);

    const load = async () => {
      const localFeatures = Array.isArray(worldCountriesGeo?.features) ? worldCountriesGeo.features : [];
      let loadedFeatures = localFeatures.length ? localFeatures : null;

      if (!loadedFeatures) {
        const remoteSources = [COUNTRIES_GEOJSON_REMOTE_URL, COUNTRIES_GEOJSON_REMOTE_FALLBACK_URL];
        for (const sourceUrl of remoteSources) {
          try {
            const response = await fetch(sourceUrl);
            if (!response.ok) continue;
            const json = await response.json();
            const features = Array.isArray(json?.features) ? json.features : [];
            if (!features.length) continue;
            loadedFeatures = features;
            break;
          } catch {
            // Continue with next source.
          }
        }
      }

      if (!mounted) return;
      if (!loadedFeatures?.length) {
        setError("World geometry could not be loaded.");
        setCountries([]);
        setGeoLoading(false);
        return;
      }

      const filtered = loadedFeatures.filter((item) => item?.geometry && !isExcludedCountryFeature(item, excludedIso3));
      setCountries(filtered);
      setGeoLoading(false);
    };

    load();
    return () => {
      mounted = false;
    };
  }, [excludedIso3]);

  useEffect(() => {
    if (!globeRef.current) return;
    globeRef.current.controls().autoRotate = true;
    globeRef.current.controls().autoRotateSpeed = 0.35;
  }, [countries.length]);

  useEffect(() => {
    const node = globeContainerRef.current;
    if (!node) return undefined;

    const update = () => {
      const width = Math.max(320, Math.floor(node.clientWidth || 0));
      const height = Math.max(420, Math.floor(node.clientHeight || 0));
      setGlobeSize({ width, height });
    };

    update();
    let observer;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(update);
      observer.observe(node);
    }
    window.addEventListener("resize", update);
    return () => {
      if (observer) observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, []);

  const countriesByIso3 = useMemo(() => {
    const lookup = new Map();
    countries.forEach((feature) => {
      const iso3 = featureIso3(feature);
      if (!iso3) return;
      lookup.set(iso3, feature);
    });
    return lookup;
  }, [countries]);

  const searchIndex = useMemo(
    () =>
      countries.map((feature) => ({
        feature,
        iso3: featureIso3(feature),
        normalizedName: normalizeCountryName(feature?.properties?.name),
      })),
    [countries],
  );

  const countriesByNormalizedName = useMemo(() => {
    const lookup = new Map();
    searchIndex.forEach((item) => {
      if (!item.normalizedName || lookup.has(item.normalizedName)) return;
      lookup.set(item.normalizedName, item.feature);
    });
    return lookup;
  }, [searchIndex]);

  const routeCountryQuery = useMemo(() => {
    const params = new URLSearchParams(routeLocation.search || "");
    return String(params.get("country") || "").trim();
  }, [routeLocation.search]);

  useEffect(() => () => activeAbortRef.current?.abort(), []);

  const loadCountryProfile = useCallback(
    async (countryIdentifier, options = {}) => {
      const {
        providedFeature = null,
        fallbackName = null,
        expectedIso3 = null,
        strictIso3 = false,
      } = options;

      const normalizedIso3 = normalizeIso3(countryIdentifier);
      const normalizedExpectedIso3 = normalizeIso3(expectedIso3);
      const rawIdentifier = String(countryIdentifier || "").trim();
      const candidates = [];

      if (strictIso3 && normalizedIso3.length === 3) {
        candidates.push(normalizedIso3);
      } else {
        if (normalizedIso3.length === 3) candidates.push(normalizedIso3);
        if (rawIdentifier) candidates.push(rawIdentifier);
        if (fallbackName) candidates.push(String(fallbackName).trim());
        if (providedFeature?.properties?.name) candidates.push(String(providedFeature.properties.name).trim());
      }

      const uniqueCandidates = [...new Set(candidates.map((item) => String(item || "").trim()).filter(Boolean))];
      if (!uniqueCandidates.length) return;
      if (normalizedIso3.length === 3 && excludedIso3.has(normalizedIso3)) {
        setError(lang === "tr" ? "Bu ulke geometri guvenlik filtresi nedeniyle devre disi." : "This country is disabled by geometry safety filters.");
        return;
      }

      const cacheKey = uniqueCandidates[0].toUpperCase();
      const cached = profileCacheRef.current.get(cacheKey);
      if (cached && Date.now() - cached.cachedAt < COUNTRY_PROFILE_CACHE_TTL_MS) {
        const payload = cached.data;
        setCountryProfile(payload);
        const preferredName = String(providedFeature?.properties?.name || "").trim();
        setCountryQuery(preferredName || payload?.country_name || rawIdentifier || normalizedIso3);
        const resolvedIso3 = normalizeIso3(payload?.iso3);
        const selectedFeature =
          providedFeature ||
          countriesByIso3.get(resolvedIso3) ||
          countriesByNormalizedName.get(normalizeCountryName(payload?.country_name)) ||
          null;
        if (selectedFeature) setSelectedCountry(selectedFeature);
        return;
      }

      const requestId = activeRequestRef.current + 1;
      activeRequestRef.current = requestId;
      activeAbortRef.current?.abort();
      const abortController = new AbortController();
      activeAbortRef.current = abortController;

      setProfileLoading(true);
      setError(null);

      try {
        let data = null;
        let lastError = null;

        for (const candidate of uniqueCandidates) {
          if (abortController.signal.aborted || activeRequestRef.current !== requestId) return;
          try {
            const requestConfig = {
              params: { lang, days: 180 },
              signal: abortController.signal,
              timeout: COUNTRY_REQUEST_TIMEOUT_MS,
            };
            let response;
            try {
              response = await api.get(`/api/v1/countries/${encodeURIComponent(candidate)}/profile`, requestConfig);
            } catch (firstError) {
              const isRetryable =
                firstError?.code === "ECONNABORTED" ||
                firstError?.code === "ERR_NETWORK" ||
                (firstError?.response && Number(firstError.response.status) >= 500);
              if (!isRetryable) throw firstError;
              await wait(COUNTRY_RETRY_DELAY_MS);
              response = await api.get(`/api/v1/countries/${encodeURIComponent(candidate)}/profile`, requestConfig);
            }
            const payload = response.data;
            const responseIso3 = normalizeIso3(payload?.iso3);
            if (!responseIso3) {
              lastError = new Error("country_profile_missing_iso3");
              continue;
            }
            if (normalizedExpectedIso3.length === 3 && responseIso3 && responseIso3 !== normalizedExpectedIso3) {
              lastError = new Error(`country_mismatch:${normalizedExpectedIso3}:${responseIso3}`);
              continue;
            }
            if (excludedIso3.has(responseIso3)) {
              lastError = new Error(`excluded_country:${responseIso3}`);
              continue;
            }
            data = payload;
            profileCacheRef.current.set(cacheKey, { cachedAt: Date.now(), data: payload });
            break;
          } catch (requestError) {
            if (requestError?.code === "ERR_CANCELED" || requestError?.name === "CanceledError") {
              throw requestError;
            }
            lastError = requestError;
          }
        }

        if (!data) throw lastError || new Error("Country profile fetch failed");
        if (abortController.signal.aborted || activeRequestRef.current !== requestId) return;

        setCountryProfile(data);
        const preferredName = String(providedFeature?.properties?.name || "").trim();
        setCountryQuery(preferredName || data?.country_name || rawIdentifier || normalizedIso3);

        const resolvedIso3 = normalizeIso3(data?.iso3);
        const selectedFeature =
          providedFeature ||
          countriesByIso3.get(resolvedIso3) ||
          countriesByNormalizedName.get(normalizeCountryName(data?.country_name)) ||
          null;

        if (selectedFeature) setSelectedCountry(selectedFeature);

        const lat = Number(data?.lat);
        const lon = Number(data?.lon);
        if (Number.isFinite(lat) && Number.isFinite(lon) && globeRef.current) {
          globeRef.current.pointOfView({ lat, lng: lon, altitude: 1.65 }, 900);
        }
      } catch (err) {
        if (err?.code === "ERR_CANCELED" || err?.name === "CanceledError" || abortController.signal.aborted) return;
        if (activeRequestRef.current !== requestId) return;
        const detail = String(err?.response?.data?.detail || err?.message || "");
        if (detail.startsWith("country_mismatch")) {
          setError(lang === "tr" ? "Secilen ulke ile donen profil uyusmuyor. Lutfen baska ulke sec." : "Selected country and returned profile do not match. Please retry.");
        } else if (detail.startsWith("excluded_country")) {
          setError(lang === "tr" ? "Bu ulke geometri guvenlik filtresi nedeniyle devre disi birakildi." : "This country is excluded due to geometry safety filters.");
        } else {
          setError(err?.response?.data?.detail || "Country profile fetch failed");
        }
      } finally {
        if (activeRequestRef.current === requestId) {
          setProfileLoading(false);
        }
      }
    },
    [lang, countriesByIso3, countriesByNormalizedName, excludedIso3],
  );

  const findCountryFeature = useCallback(
    (query) => {
      const normalizedQuery = normalizeCountryName(query);
      if (!normalizedQuery) return null;

      const asIso3 = normalizeIso3(query);
      if (asIso3.length === 3 && countriesByIso3.has(asIso3)) return countriesByIso3.get(asIso3);

      const aliasTarget = COUNTRY_NAME_ALIASES[normalizedQuery];
      if (aliasTarget) {
        const aliasIso3 = normalizeIso3(aliasTarget);
        if (aliasIso3.length === 3 && countriesByIso3.has(aliasIso3)) return countriesByIso3.get(aliasIso3);
      }

      if (countriesByNormalizedName.has(normalizedQuery)) {
        return countriesByNormalizedName.get(normalizedQuery);
      }

      const startsWithMatches = searchIndex.filter((item) => item.normalizedName.startsWith(normalizedQuery));
      if (startsWithMatches.length === 1) return startsWithMatches[0].feature;

      const tokenMatches = searchIndex.filter((item) => item.normalizedName.split(/\s+/).includes(normalizedQuery));
      if (tokenMatches.length === 1) return tokenMatches[0].feature;

      return null;
    },
    [countriesByIso3, countriesByNormalizedName, searchIndex],
  );

  const openFeatureProfile = useCallback(
    async (feature) => {
      const iso3 = featureIso3(feature);
      const countryName = String(feature?.properties?.name || "").trim();
      if (!iso3 && !countryName) return;
      if (excludedIso3.has(iso3)) {
        setError(lang === "tr" ? "Bu ulke geometri guvenlik filtresi nedeniyle devre disi." : "This country is disabled by geometry safety filters.");
        return;
      }

      setSelectedCountry(feature);
      setCountryQuery(countryName || iso3);
      await loadCountryProfile(iso3 || countryName, {
        providedFeature: feature,
        fallbackName: countryName,
        expectedIso3: iso3,
        strictIso3: Boolean(iso3),
      });
    },
    [excludedIso3, lang, loadCountryProfile],
  );

  const handleCountrySearch = async (event) => {
    event.preventDefault();
    const feature = findCountryFeature(countryQuery);
    if (!feature) {
      setError(t("countryNotFound"));
      return;
    }
    await openFeatureProfile(feature);
  };

  const handleCountryClick = async (countryFeature) => {
    if (!countryFeature) return;
    if (isExcludedCountryFeature(countryFeature, excludedIso3)) {
      setError(lang === "tr" ? "Secilen ulke gecersiz geometri nedeniyle filtrelendi." : "Selected country is filtered due to invalid geometry.");
      return;
    }
    await openFeatureProfile(countryFeature);
  };

  useEffect(() => {
    if (!routeCountryQuery || !countries.length) return;
    const normalizedRouteQuery = normalizeIso3(routeCountryQuery) || normalizeCountryName(routeCountryQuery);
    if (autoLoadedCountryRef.current === normalizedRouteQuery) return;

    const feature = findCountryFeature(routeCountryQuery);
    if (!feature) return;

    autoLoadedCountryRef.current = normalizedRouteQuery;
    setCountryQuery(String(feature?.properties?.name || featureIso3(feature) || routeCountryQuery));
    openFeatureProfile(feature);
  }, [routeCountryQuery, countries.length, findCountryFeature, openFeatureProfile]);

  useEffect(() => {
    if (!countries.length || countryProfile || profileLoading || routeCountryQuery) return;
    const defaultCountry = countriesByIso3.get("TUR") || countries[0];
    if (!featureIso3(defaultCountry)) return;
    setSelectedCountry(defaultCountry);
    loadCountryProfile(String(featureIso3(defaultCountry)), {
      providedFeature: defaultCountry,
      fallbackName: defaultCountry?.properties?.name,
      expectedIso3: String(featureIso3(defaultCountry)),
      strictIso3: true,
    });
  }, [countries, countriesByIso3, countryProfile, profileLoading, routeCountryQuery, loadCountryProfile]);

  const highlightedIso3 = useMemo(() => {
    if (countryProfile?.iso3) return normalizeIso3(countryProfile.iso3);
    if (selectedCountry) return featureIso3(selectedCountry);
    return null;
  }, [countryProfile, selectedCountry]);

  const timelineData = useMemo(() => {
    const locale = lang === "tr" ? "tr-TR" : "en-US";
    const timeline = countryProfile?.historical_summary?.timeline || [];
    return timeline.map((item) => ({
      label: new Date(item.bucket_start).toLocaleDateString(locale, { month: "short", day: "2-digit" }),
      signals: item.signal_count,
      high: item.high_severity_count,
      disasters: item.disaster_count,
    }));
  }, [countryProfile, lang]);

  const topThreats = countryProfile?.historical_summary?.top_threats || [];
  const citations = countryProfile?.insight?.content?.citations || [];
  const trendDirection = countryProfile?.historical_summary?.trend_direction || "stable";
  const macroMetrics = countryProfile?.macro_metrics || [];
  const resilienceScorecard = countryProfile?.resilience_scorecard;
  const narrative = countryProfile?.narrative;

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
      <div className="min-w-0 rounded-2xl border border-zinc-800 bg-zinc-900 p-3 shadow-xl">
        <div className="mb-3 px-2">
          <h2 className="text-lg font-bold text-zinc-100">{t("worldExplorer")}</h2>
          <p className="text-sm text-zinc-400">{t("worldExplorerHint")}</p>
        </div>

        <form onSubmit={handleCountrySearch} className="mb-3 flex flex-col gap-2 px-2 sm:flex-row">
          <div className="relative flex-1">
            <Search size={14} className="pointer-events-none absolute left-3 top-3 text-zinc-500" />
            <input
              value={countryQuery}
              onChange={(event) => setCountryQuery(event.target.value)}
              placeholder={t("searchCountryPlaceholder")}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 py-2 pl-8 pr-3 text-sm text-zinc-100 outline-none transition focus:border-emerald-500"
            />
          </div>
          <button
            type="submit"
            disabled={profileLoading}
            className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs font-semibold text-zinc-100 hover:border-emerald-500 disabled:opacity-60 sm:min-w-[110px]"
          >
            {t("openLocation")}
          </button>
        </form>

        <div ref={globeContainerRef} className="relative h-[56vh] min-h-[460px] max-h-[720px] w-full overflow-hidden rounded-xl border border-zinc-800 bg-black/30">
          {geoLoading || !globeSize.width || !globeSize.height ? (
            <div className="flex h-full items-center justify-center text-zinc-300">
              <LoaderCircle className="mr-2 animate-spin" size={18} />
              {t("loading")}
            </div>
          ) : (
            <Globe
              ref={globeRef}
              width={globeSize.width}
              height={globeSize.height}
              globeImageUrl={EARTH_TEXTURE_URL}
              bumpImageUrl={EARTH_BUMP_URL}
              backgroundColor="rgba(0,0,0,0)"
              polygonsData={countries}
              polygonCapColor={(feature) => {
                const id = featureIso3(feature);
                if (highlightedIso3 && highlightedIso3.length === 3 && id === highlightedIso3) return "rgba(16,185,129,0.9)";
                return "rgba(56,189,248,0.28)";
              }}
              polygonSideColor={() => "rgba(2,132,199,0.22)"}
              polygonStrokeColor={() => "rgba(15,23,42,0.85)"}
              polygonAltitude={(feature) => {
                const id = featureIso3(feature);
                if (highlightedIso3 && highlightedIso3.length === 3 && id === highlightedIso3) return 0.09;
                return 0.02;
              }}
              polygonLabel={(feature) => `${feature?.properties?.name || "Country"} (${featureIso3(feature) || "-"})`}
              onPolygonClick={handleCountryClick}
              atmosphereAltitude={0.2}
              atmosphereColor="#60a5fa"
            />
          )}
        </div>
      </div>

      <div className="space-y-4 xl:sticky xl:top-24 xl:max-h-[calc(100vh-120px)] xl:overflow-y-auto xl:pr-1">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 shadow-xl">
          <h3 className="text-lg font-bold text-zinc-100">{t("countryClimateProfile")}</h3>
          {profileLoading ? (
            <div className="mt-3 flex items-center text-zinc-300">
              <LoaderCircle className="mr-2 animate-spin" size={16} />
              {t("loading")}
            </div>
          ) : countryProfile ? (
            <div className="mt-3 space-y-2 text-sm text-zinc-300">
              <p className="text-base font-semibold text-zinc-100">
                {countryProfile.country_name} ({countryProfile.iso3})
              </p>
              <p>Region: {countryProfile.region || "-"}</p>
              <p>Capital: {countryProfile.capital || "-"}</p>
              <p>Population: {formatNumber(countryProfile.population)}</p>
              <p>Area (km2): {formatNumber(countryProfile.area_km2)}</p>
              <p>Signals ({countryProfile.signal_summary.lookback_days}d): {countryProfile.signal_summary.total_signals}</p>
              <p>Primary threat: {formatThreatLabel(countryProfile.signal_summary.primary_threat)}</p>
              <p>Computed risk: {countryProfile.signal_summary.computed_risk_score}/100</p>
              <p>Trend: {formatThreatLabel(trendDirection)}</p>
            </div>
          ) : (
            <p className="mt-3 text-sm text-zinc-400">{t("selectCountryHint")}</p>
          )}
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 shadow-xl">
          <h3 className="text-lg font-bold text-zinc-100">{t("historicalSignals")}</h3>
          {timelineData.length ? (
            <div className="mt-3 space-y-4">
              <SafeResponsiveChart className="h-44 w-full min-w-0" placeholder={t("loading")}>
                <LineChart data={timelineData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                  <XAxis dataKey="label" tick={{ fill: "#a1a1aa", fontSize: 10 }} tickLine={false} axisLine={{ stroke: "#3f3f46" }} />
                  <YAxis tick={{ fill: "#a1a1aa", fontSize: 10 }} tickLine={false} axisLine={{ stroke: "#3f3f46" }} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "#09090b", border: "1px solid #27272a", color: "#e4e4e7" }}
                    labelStyle={{ color: "#e4e4e7" }}
                  />
                  <Line type="monotone" dataKey="signals" stroke="#34d399" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="high" stroke="#f97316" strokeWidth={1.4} dot={false} />
                </LineChart>
              </SafeResponsiveChart>

              {topThreats.length ? (
                <SafeResponsiveChart className="h-36 w-full min-w-0" placeholder={t("loading")}>
                  <BarChart data={topThreats.map((item) => ({ ...item, threat: formatThreatLabel(item.threat) }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                    <XAxis dataKey="threat" tick={{ fill: "#a1a1aa", fontSize: 10 }} tickLine={false} axisLine={{ stroke: "#3f3f46" }} />
                    <YAxis tick={{ fill: "#a1a1aa", fontSize: 10 }} tickLine={false} axisLine={{ stroke: "#3f3f46" }} />
                    <Tooltip
                      contentStyle={{ backgroundColor: "#09090b", border: "1px solid #27272a", color: "#e4e4e7" }}
                      labelStyle={{ color: "#e4e4e7" }}
                    />
                    <Bar dataKey="count" fill="#60a5fa" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </SafeResponsiveChart>
              ) : null}
            </div>
          ) : (
            <p className="mt-3 text-sm text-zinc-400">{t("noRecentEvents")}</p>
          )}
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 shadow-xl">
          <h3 className="text-lg font-bold text-zinc-100">{t("climateIntelligenceBrief")}</h3>
          {narrative ? (
            <div className="mt-3 space-y-3 text-sm text-zinc-300">
              <p className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3 leading-relaxed text-zinc-200">{narrative.executive_brief}</p>
              <p className="leading-relaxed">{narrative.climate_context}</p>
              <p className="leading-relaxed">{narrative.sustainability_context}</p>
            </div>
          ) : (
            <p className="mt-3 text-sm text-zinc-400">{t("selectCountryHint")}</p>
          )}
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 shadow-xl">
          <h3 className="text-lg font-bold text-zinc-100">{t("resilienceScorecard")}</h3>
          {resilienceScorecard ? (
            <div className="mt-3 space-y-4 text-sm text-zinc-300">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
                  <p className="text-xs uppercase tracking-wide text-zinc-500">{t("overallResilience")}</p>
                  <p className={`mt-1 text-2xl font-extrabold ${scoreTone(resilienceScorecard.overall_resilience_score)}`}>
                    {resilienceScorecard.overall_resilience_score.toFixed(1)}
                  </p>
                </div>
                <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
                  <p className="text-xs uppercase tracking-wide text-zinc-500">{t("adaptationReadiness")}</p>
                  <p className={`mt-1 text-2xl font-extrabold ${scoreTone(resilienceScorecard.adaptation_readiness_score)}`}>
                    {resilienceScorecard.adaptation_readiness_score.toFixed(1)}
                  </p>
                </div>
                <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
                  <p className="text-xs uppercase tracking-wide text-zinc-500">{t("climatePressure")}</p>
                  <p className="mt-1 text-2xl font-extrabold text-amber-300">{resilienceScorecard.climate_pressure_score.toFixed(1)}</p>
                </div>
              </div>

              <p className="leading-relaxed text-zinc-200">{resilienceScorecard.narrative}</p>

              <div className="space-y-3">
                {(resilienceScorecard.dimensions || []).map((dimension, idx) => (
                  <div key={`dimension-${idx}`} className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-zinc-100">{dimension.name}</p>
                      <p className={`text-sm font-bold ${scoreTone(dimension.score)}`}>{dimension.score.toFixed(1)}</p>
                    </div>
                    <div className="mt-2 h-2 w-full rounded-full bg-zinc-800">
                      <div className="h-2 rounded-full bg-emerald-400" style={{ width: `${Math.max(3, Math.min(100, dimension.score))}%` }} />
                    </div>
                    <p className="mt-2 text-xs leading-relaxed text-zinc-400">{dimension.narrative}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="mt-3 text-sm text-zinc-400">{t("selectCountryHint")}</p>
          )}
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 shadow-xl">
          <h3 className="text-lg font-bold text-zinc-100">{t("sustainabilityIndicators")}</h3>
          {macroMetrics.length ? (
            <div className="mt-3 space-y-2 text-sm text-zinc-300">
              {macroMetrics.map((metric, idx) => (
                <div key={`metric-${idx}`} className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-zinc-100">{metric.label}</p>
                      <p className="text-xs text-zinc-500">
                        {metric.indicator_id} {metric.year ? `- ${metric.year}` : ""}
                      </p>
                    </div>
                    <p className="text-base font-bold text-emerald-300">{formatMetricValue(metric)}</p>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <p className="text-zinc-500">
                      {t("comparedToWorld")}:{" "}
                      {metric.benchmark_value !== null && metric.benchmark_value !== undefined
                        ? `${metric.benchmark_value.toFixed(2)}${metric.unit ? ` ${metric.unit}` : ""}`
                        : "-"}
                    </p>
                    <p
                      className={
                        metric.delta_pct_vs_benchmark === null || metric.delta_pct_vs_benchmark === undefined
                          ? "font-semibold text-zinc-400"
                          : metric.delta_pct_vs_benchmark >= 0
                            ? "font-semibold text-emerald-300"
                            : "font-semibold text-amber-300"
                      }
                    >
                      {formatSignedPercent(metric.delta_pct_vs_benchmark)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm text-zinc-400">{t("noMacroMetrics")}</p>
          )}
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 shadow-xl">
          <h3 className="text-lg font-bold text-zinc-100">{t("actionTracks90d")}</h3>
          {narrative ? (
            <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3 text-sm text-zinc-300">
                <p className="mb-2 font-semibold text-zinc-100">{t("watchlist30d")}</p>
                <ul className="space-y-1.5">
                  {(narrative.watch_items_30d || []).map((item, idx) => (
                    <li key={`watch-${idx}`} className="leading-relaxed text-zinc-300">
                      - {item}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3 text-sm text-zinc-300">
                <p className="mb-2 font-semibold text-zinc-100">{t("actionTracks90d")}</p>
                <ul className="space-y-1.5">
                  {(narrative.action_tracks_90d || []).map((item, idx) => (
                    <li key={`track-${idx}`} className="leading-relaxed text-zinc-300">
                      - {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ) : (
            <p className="mt-3 text-sm text-zinc-400">{t("selectCountryHint")}</p>
          )}
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 shadow-xl">
          <h3 className="text-lg font-bold text-zinc-100">{t("insights")}</h3>
          {countryProfile?.insight?.content ? (
            <div className="mt-3 space-y-3 text-sm text-zinc-300">
              <p className="text-zinc-200">{countryProfile.insight.content.summary}</p>
              <p>{countryProfile.insight.content.risk_rationale}</p>
              <ul className="space-y-1 text-zinc-200">
                {(countryProfile.insight.content.recommendations || []).slice(0, 4).map((item, idx) => (
                  <li key={`rec-${idx}`}>- {item}</li>
                ))}
              </ul>
              {citations.length ? (
                <div className="space-y-1 pt-1 text-xs">
                  <p className="font-semibold text-zinc-200">{t("citations")}</p>
                  {citations.slice(0, 5).map((item, idx) => (
                    <a
                      key={`citation-${idx}`}
                      href={item.source_url}
                      target="_blank"
                      rel="noreferrer"
                      className="block truncate text-sky-400 hover:underline"
                    >
                      {item.source} - {new Date(item.timestamp_utc).toLocaleDateString()}
                    </a>
                  ))}
                </div>
              ) : null}
            </div>
          ) : (
            <p className="mt-3 text-sm text-zinc-400">{t("selectCountryHint")}</p>
          )}
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 shadow-xl">
          <h3 className="text-lg font-bold text-zinc-100">{t("recentSignalsCountry")}</h3>
          {countryProfile?.recent_signals?.length ? (
            <div className="mt-3 max-h-64 space-y-2 overflow-auto pr-1">
              {countryProfile.recent_signals.slice(0, 10).map((item, idx) => (
                <div key={`signal-${idx}`} className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-3 text-xs text-zinc-300">
                  <p className="font-semibold text-zinc-100">{cleanText(item.title)}</p>
                  <p className="mt-1 text-zinc-400">{new Date(item.occurred_at).toLocaleString()}</p>
                  <p className="mt-1 line-clamp-3">{cleanText(item.summary)}</p>
                  <a href={item.source_url} target="_blank" rel="noreferrer" className="mt-1 inline-block text-emerald-400 hover:underline">
                    {item.source}
                  </a>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm text-zinc-400">{t("noRecentEvents")}</p>
          )}
        </div>

        {error ? <div className="rounded-xl border border-red-900 bg-red-950/40 p-4 text-sm text-red-300">{String(error)}</div> : null}
      </div>
    </div>
  );
}

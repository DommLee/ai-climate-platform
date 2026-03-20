import React, { useEffect, useMemo, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { api } from "../api/client";
import { useClimate } from "../context/ClimateContext";
import { useI18n } from "../context/I18nContext";

function normalizeIso(value) {
  return String(value || "")
    .trim()
    .toUpperCase();
}

function buildCountryFallbackFromLocations(locations, countryDisplayNames) {
  const grouped = new Map();
  (locations || []).forEach((item) => {
    const iso2 = normalizeIso(item?.country);
    if (!iso2) return;
    const row = grouped.get(iso2) || {
      iso2,
      iso3: iso2,
      country_name: countryDisplayNames?.of(iso2) || iso2,
      city_count: 0,
    };
    row.city_count += 1;
    grouped.set(iso2, row);
  });

  return [...grouped.values()].sort((a, b) => String(a.country_name || "").localeCompare(String(b.country_name || ""), "en"));
}

export default function LocationSelect() {
  const { locations, locationId, setLocationId } = useClimate();
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [countryIso3, setCountryIso3] = useState("");
  const [countries, setCountries] = useState([]);
  const [cityOptions, setCityOptions] = useState([]);
  const [countriesLoading, setCountriesLoading] = useState(false);
  const [citiesLoading, setCitiesLoading] = useState(false);

  const countryDisplayNames = useMemo(() => {
    if (typeof Intl === "undefined" || typeof Intl.DisplayNames !== "function") return null;
    try {
      return new Intl.DisplayNames(["en"], { type: "region" });
    } catch {
      return null;
    }
  }, []);

  const fallbackCountries = useMemo(() => buildCountryFallbackFromLocations(locations, countryDisplayNames), [locations, countryDisplayNames]);

  useEffect(() => {
    let mounted = true;
    setCountriesLoading(true);
    api
      .get("/api/v1/countries")
      .then(({ data }) => {
        if (!mounted) return;
        const rows = Array.isArray(data?.items) ? data.items : [];
        if (rows.length) {
          setCountries(
            rows
              .map((item) => ({
                iso2: normalizeIso(item?.iso2),
                iso3: normalizeIso(item?.iso3),
                country_name: String(item?.country_name || item?.iso3 || item?.iso2 || ""),
                city_count: Number(item?.city_count || 0),
              }))
              .filter((item) => item.iso3),
          );
          return;
        }
        setCountries(fallbackCountries);
      })
      .catch(() => {
        if (!mounted) return;
        setCountries(fallbackCountries);
      })
      .finally(() => {
        if (mounted) setCountriesLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [fallbackCountries]);

  const countriesByIso3 = useMemo(() => {
    const map = new Map();
    countries.forEach((item) => {
      const iso3 = normalizeIso(item?.iso3);
      if (!iso3) return;
      map.set(iso3, item);
    });
    return map;
  }, [countries]);

  useEffect(() => {
    if (!locations.length) {
      setCountryIso3("");
      setCityOptions([]);
      return;
    }
    const selectedLocation = locations.find((item) => item.id === locationId) || locations[0];
    const selectedIso2 = normalizeIso(selectedLocation?.country);
    if (!selectedIso2) return;

    const byIso2 = countries.find((item) => normalizeIso(item?.iso2) === selectedIso2);
    const nextIso3 = normalizeIso(byIso2?.iso3 || selectedIso2);
    if (nextIso3) {
      setCountryIso3((previous) => (previous === nextIso3 ? previous : nextIso3));
    }
  }, [locations, locationId, countries]);

  useEffect(() => {
    if (!countryIso3) {
      setCityOptions([]);
      return;
    }

    const selectedCountry = countriesByIso3.get(countryIso3);
    const selectedIso2 = normalizeIso(selectedCountry?.iso2);
    const fallbackCities = locations
      .filter((item) => {
        const cityIso2 = normalizeIso(item?.country);
        if (selectedIso2) return cityIso2 === selectedIso2;
        return cityIso2 === countryIso3;
      })
      .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "en"));

    // Show deterministic local fallback immediately so country switching stays responsive
    // even when remote city endpoint is slow/unavailable.
    setCityOptions(fallbackCities);
    if (!fallbackCities.some((item) => item.id === locationId) && fallbackCities[0]?.id) {
      setLocationId(fallbackCities[0].id);
    }

    let mounted = true;
    setCitiesLoading(true);
    api
      .get(`/api/v1/countries/${encodeURIComponent(countryIso3)}/cities`)
      .then(({ data }) => {
        if (!mounted) return;
        const apiItems = Array.isArray(data?.items) ? data.items : [];
        const normalizedItems = apiItems.length ? apiItems : fallbackCities;
        setCityOptions(normalizedItems);
        if (!normalizedItems.some((item) => item.id === locationId) && normalizedItems[0]?.id) {
          setLocationId(normalizedItems[0].id);
        }
      })
      .catch(() => {
        if (!mounted) return;
        setCityOptions(fallbackCities);
        if (!fallbackCities.some((item) => item.id === locationId) && fallbackCities[0]?.id) {
          setLocationId(fallbackCities[0].id);
        }
      })
      .finally(() => {
        if (mounted) setCitiesLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [countryIso3, countriesByIso3, locations, setLocationId]);

  const filteredLocations = useMemo(() => {
    const normalized = String(query || "").trim().toLowerCase();
    if (!normalized) return cityOptions;
    return cityOptions.filter((item) => {
      const haystack = `${item.name} ${item.country}`.toLowerCase();
      return haystack.includes(normalized);
    });
  }, [cityOptions, query]);

  const handleCountryChange = (event) => {
    const nextCountryIso3 = normalizeIso(event.target.value);
    setCountryIso3(nextCountryIso3);
    setQuery("");
  };

  return (
    <div className="flex items-center gap-2 text-sm text-zinc-300">
      <span>{t("location")}</span>
      <div className="flex flex-col gap-1">
        <span className="text-[10px] uppercase tracking-wide text-zinc-500">{t("countryLabel")}</span>
        <select
          className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm text-zinc-100"
          value={countryIso3}
          onChange={handleCountryChange}
          disabled={countriesLoading || !countries.length}
        >
          {countries.map((item) => (
            <option key={item.iso3} value={item.iso3}>
              {item.country_name} ({item.iso3})
            </option>
          ))}
        </select>
        <span className="text-[10px] uppercase tracking-wide text-zinc-500">{t("cityLabel")}</span>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("locationSearchPlaceholder")}
          className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-100 outline-none focus:border-emerald-500"
        />
        <select
          className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm text-zinc-100"
          value={locationId}
          onChange={(event) => setLocationId(event.target.value)}
          disabled={citiesLoading || (!filteredLocations.length && !cityOptions.length)}
        >
          {filteredLocations.length ? (
            filteredLocations.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} ({item.country})
              </option>
            ))
          ) : (
            <option value="" disabled>
              {t("locationNoResults")}
            </option>
          )}
        </select>
        <div className="flex items-center justify-between text-[10px] text-zinc-500">
          <span>
            {filteredLocations.length}/{cityOptions.length || locations.length} {t("locationCount")}
          </span>
          {countriesLoading || citiesLoading ? (
            <span className="inline-flex items-center gap-1">
              <LoaderCircle size={10} className="animate-spin" />
              {t("syncing")}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

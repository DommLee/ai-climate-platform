import React, { useEffect, useMemo, useState } from "react";
import { useClimate } from "../context/ClimateContext";
import { useI18n } from "../context/I18nContext";

export default function LocationSelect() {
  const { locations, locationId, setLocationId } = useClimate();
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [countryCode, setCountryCode] = useState("");

  const countryDisplayNames = useMemo(() => {
    if (typeof Intl === "undefined" || typeof Intl.DisplayNames !== "function") return null;
    try {
      return new Intl.DisplayNames(["en"], { type: "region" });
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    if (!locations.length) {
      setCountryCode("");
      return;
    }
    const selected = locations.find((item) => item.id === locationId) || locations[0];
    const selectedCountry = String(selected?.country || "").toUpperCase();
    if (selectedCountry && selectedCountry !== countryCode) {
      setCountryCode(selectedCountry);
    }
  }, [locations, locationId, countryCode]);

  const countries = useMemo(() => {
    const unique = [...new Set(locations.map((item) => String(item.country || "").toUpperCase()).filter(Boolean))];
    return unique.sort((a, b) => {
      const nameA = countryDisplayNames?.of(a) || a;
      const nameB = countryDisplayNames?.of(b) || b;
      return nameA.localeCompare(nameB, "en");
    });
  }, [locations, countryDisplayNames]);

  const locationsInCountry = useMemo(() => {
    if (!countryCode) return locations;
    return locations.filter((item) => String(item.country || "").toUpperCase() === countryCode);
  }, [locations, countryCode]);

  const filteredLocations = useMemo(() => {
    const normalized = String(query || "").trim().toLowerCase();
    if (!normalized) return locationsInCountry;
    return locationsInCountry.filter((item) => {
      const haystack = `${item.name} ${item.country}`.toLowerCase();
      return haystack.includes(normalized);
    });
  }, [locationsInCountry, query]);

  const handleCountryChange = (event) => {
    const nextCountryCode = String(event.target.value || "").toUpperCase();
    setCountryCode(nextCountryCode);
    setQuery("");
    const firstCity = locations.find((item) => String(item.country || "").toUpperCase() === nextCountryCode);
    if (firstCity && firstCity.id !== locationId) {
      setLocationId(firstCity.id);
    }
  };

  return (
    <div className="flex items-center gap-2 text-sm text-zinc-300">
      <span>{t("location")}</span>
      <div className="flex flex-col gap-1">
        <select
          className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm text-zinc-100"
          value={countryCode}
          onChange={handleCountryChange}
        >
          {countries.map((code) => (
            <option key={code} value={code}>
              {(countryDisplayNames?.of(code) || code)} ({code})
            </option>
          ))}
        </select>
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
        <span className="text-[10px] text-zinc-500">
          {filteredLocations.length}/{locationsInCountry.length || locations.length} {t("locationCount")}
        </span>
      </div>
    </div>
  );
}

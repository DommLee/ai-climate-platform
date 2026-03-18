import React, { useMemo, useState } from "react";
import { useClimate } from "../context/ClimateContext";
import { useI18n } from "../context/I18nContext";

export default function LocationSelect() {
  const { locations, locationId, setLocationId } = useClimate();
  const { t } = useI18n();
  const [query, setQuery] = useState("");

  const filteredLocations = useMemo(() => {
    const normalized = String(query || "").trim().toLowerCase();
    if (!normalized) return locations;
    return locations.filter((item) => {
      const haystack = `${item.name} ${item.country}`.toLowerCase();
      return haystack.includes(normalized);
    });
  }, [locations, query]);

  return (
    <div className="flex items-center gap-2 text-sm text-zinc-300">
      <span>{t("location")}</span>
      <div className="flex flex-col gap-1">
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
          {filteredLocations.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name} ({item.country})
            </option>
          ))}
        </select>
        <span className="text-[10px] text-zinc-500">
          {filteredLocations.length}/{locations.length} {t("locationCount")}
        </span>
      </div>
    </div>
  );
}

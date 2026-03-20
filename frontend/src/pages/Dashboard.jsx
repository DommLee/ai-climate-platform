import React from "react";
import { CloudSun, Droplets, Wind } from "lucide-react";
import { useClimate } from "../context/ClimateContext";
import { useI18n } from "../context/I18nContext";
import RiskGaugeCard from "../components/RiskGaugeCard";
import TimeseriesChart from "../components/TimeseriesChart";
import MapEmbed from "../components/MapEmbed";
import RecentEventsPanel from "../components/RecentEventsPanel";
import GlobalHotspotsPanel from "../components/GlobalHotspotsPanel";
import OperationalCommandPanel from "../components/OperationalCommandPanel";
import DataHealthBanner from "../components/DataHealthBanner";

function WeatherItem({ icon, label, value }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
      <div className="flex items-center gap-2 text-zinc-300">
        {icon}
        <span className="text-xs uppercase tracking-wide">{label}</span>
      </div>
      <p className="mt-2 text-2xl font-black text-zinc-100">{value}</p>
    </div>
  );
}

export default function Dashboard() {
  const { t } = useI18n();
  const { snapshot, riskData, forecastSeries, events, globalHotspots, loading, error, locations, locationId, setLocationId, runtimeStatus, systemStatus } = useClimate();

  if (loading && !snapshot) {
    return <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-8 text-zinc-300">{t("loading")}</div>;
  }
  if (error && !snapshot) {
    return <div className="rounded-2xl border border-red-900 bg-red-950/40 p-8 text-red-300">{String(error)}</div>;
  }
  if (!snapshot) return null;

  const location = locations.find((x) => x.id === locationId);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <WeatherItem icon={<CloudSun size={16} />} label="Temp" value={`${snapshot.current_weather.temperature_c.toFixed(1)} C`} />
            <WeatherItem icon={<Droplets size={16} />} label="Humidity" value={`${snapshot.current_weather.humidity_pct.toFixed(0)} %`} />
            <WeatherItem icon={<Wind size={16} />} label="Wind" value={`${snapshot.current_weather.wind_kmh.toFixed(1)} km/h`} />
          </div>
          <TimeseriesChart points={forecastSeries} />
        </div>

        <div className="space-y-4">
          <DataHealthBanner sourceAttribution={snapshot.source_attribution} runtimeStatus={runtimeStatus} systemStatus={systemStatus} />
          <RiskGaugeCard
            risk={snapshot.risk}
            generatedAt={snapshot.generated_at}
            sourceAttribution={snapshot.source_attribution}
            runtimeStatus={runtimeStatus}
            systemStatus={systemStatus}
          />
          <OperationalCommandPanel snapshot={snapshot} riskData={riskData} events={events} locationName={location?.name} />
          <MapEmbed lat={location?.lat} lon={location?.lon} locationName={location?.name} countryCode={location?.country} />
          <GlobalHotspotsPanel items={globalHotspots} currentLocationId={locationId} onSelectLocation={setLocationId} />
          <RecentEventsPanel items={events} />
        </div>
      </div>
    </div>
  );
}

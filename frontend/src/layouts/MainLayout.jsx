import React from "react";
import { NavLink, Outlet } from "react-router-dom";
import { Activity, Gauge, Globe, Info, Scale, Sparkles } from "lucide-react";
import { useClimate } from "../context/ClimateContext";
import { useI18n } from "../context/I18nContext";
import LocationSelect from "../components/LocationSelect";
import LanguageToggle from "../components/LanguageToggle";

export default function MainLayout() {
  const { t } = useI18n();
  const { refreshData, loading } = useClimate();

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800 bg-zinc-900/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-emerald-500 p-2 text-zinc-950">
              <Activity size={20} />
            </div>
            <div>
              <h1 className="text-xl font-black tracking-tight">{t("appTitle")}</h1>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <LocationSelect />
            <LanguageToggle />
            <button
              disabled={loading}
              onClick={() => refreshData({ forceInsight: true })}
              className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm font-semibold hover:border-emerald-500 disabled:opacity-50"
            >
              {t("refresh")}
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-6 px-6 py-6 md:grid-cols-[220px_1fr]">
        <aside className="rounded-2xl border border-zinc-800 bg-zinc-900 p-3 md:h-fit">
          <NavLink
            to="/"
            end
            className={({ isActive }) => `mb-2 flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold ${isActive ? "bg-emerald-500 text-zinc-950" : "hover:bg-zinc-800"}`}
          >
            <Gauge size={16} />
            {t("dashboard")}
          </NavLink>
          <NavLink
            to="/risk-analysis"
            className={({ isActive }) => `mb-2 flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold ${isActive ? "bg-emerald-500 text-zinc-950" : "hover:bg-zinc-800"}`}
          >
            <Activity size={16} />
            {t("riskAnalysis")}
          </NavLink>
          <NavLink
            to="/solutions"
            className={({ isActive }) => `mb-2 flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold ${isActive ? "bg-emerald-500 text-zinc-950" : "hover:bg-zinc-800"}`}
          >
            <Sparkles size={16} />
            {t("insights")}
          </NavLink>
          <NavLink
            to="/world"
            className={({ isActive }) => `flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold ${isActive ? "bg-emerald-500 text-zinc-950" : "hover:bg-zinc-800"}`}
          >
            <Globe size={16} />
            {t("worldExplorer")}
          </NavLink>
          <NavLink
            to="/compare"
            className={({ isActive }) => `mt-2 flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold ${isActive ? "bg-emerald-500 text-zinc-950" : "hover:bg-zinc-800"}`}
          >
            <Scale size={16} />
            {t("countryCompare")}
          </NavLink>
          <NavLink
            to="/about"
            className={({ isActive }) => `mt-2 flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold ${isActive ? "bg-emerald-500 text-zinc-950" : "hover:bg-zinc-800"}`}
          >
            <Info size={16} />
            {t("about")}
          </NavLink>
        </aside>

        <main>
          <Outlet />
        </main>
      </div>
    </div>
  );
}

import React, { Suspense, lazy } from "react";
import { BrowserRouter, HashRouter, Route, Routes } from "react-router-dom";
import { ClimateProvider } from "./context/ClimateContext";
import { I18nProvider } from "./context/I18nContext";
import MainLayout from "./layouts/MainLayout";

const Dashboard = lazy(() => import("./pages/Dashboard"));
const RiskAnalysis = lazy(() => import("./pages/RiskAnalysis"));
const Solutions = lazy(() => import("./pages/Solutions"));
const WorldExplorer = lazy(() => import("./pages/WorldExplorer"));
const CountryCompare = lazy(() => import("./pages/CountryCompare"));
const About = lazy(() => import("./pages/About"));

const Router = import.meta.env.VITE_ROUTER_MODE === "hash" ? HashRouter : BrowserRouter;

export default function App() {
  return (
    <I18nProvider>
      <ClimateProvider>
        <Router>
          <Suspense fallback={<div className="p-6 text-zinc-300">Loading...</div>}>
            <Routes>
              <Route path="/" element={<MainLayout />}>
                <Route index element={<Dashboard />} />
                <Route path="risk-analysis" element={<RiskAnalysis />} />
                <Route path="solutions" element={<Solutions />} />
                <Route path="world" element={<WorldExplorer />} />
                <Route path="compare" element={<CountryCompare />} />
                <Route path="about" element={<About />} />
              </Route>
            </Routes>
          </Suspense>
        </Router>
      </ClimateProvider>
    </I18nProvider>
  );
}

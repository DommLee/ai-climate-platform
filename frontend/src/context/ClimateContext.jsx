import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api } from "../api/client";
import { getRuntimeStatus, subscribeRuntimeStatus } from "../api/runtimeConfig";
import { useI18n } from "./I18nContext";

const ClimateContext = createContext(null);

export function ClimateProvider({ children }) {
  const { lang } = useI18n();
  const [locations, setLocations] = useState([]);
  const [locationId, setLocationId] = useState("new_york");

  const [snapshot, setSnapshot] = useState(null);
  const [riskData, setRiskData] = useState(null);
  const [riskFeatures, setRiskFeatures] = useState([]);
  const [events, setEvents] = useState([]);
  const [forecastSeries, setForecastSeries] = useState([]);
  const [insight, setInsight] = useState(null);
  const [sources, setSources] = useState([]);
  const [complianceItems, setComplianceItems] = useState([]);
  const [modelVersions, setModelVersions] = useState(null);
  const [globalHotspots, setGlobalHotspots] = useState([]);
  const [systemStatus, setSystemStatus] = useState(null);
  const [runtimeStatus, setRuntimeStatus] = useState(getRuntimeStatus());

  const [reportJob, setReportJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchLocations = useCallback(async () => {
    const { data } = await api.get("/api/v1/locations");
    setLocations(data || []);
    if (data?.length && !data.find((x) => x.id === locationId)) {
      setLocationId(data[0].id);
    }
  }, [locationId]);

  const fetchStaticPanels = useCallback(async () => {
    const [sourcesRes, complianceRes, versionsRes, hotspotsRes] = await Promise.allSettled([
      api.get("/api/v1/sources"),
      api.get("/api/v1/compliance/checklist"),
      api.get("/api/v1/governance/model-versions"),
      api.get("/api/v1/locations/rankings", { params: { limit: 8 } }),
    ]);

    if (sourcesRes.status === "fulfilled") setSources(sourcesRes.value.data?.items || []);
    if (complianceRes.status === "fulfilled") setComplianceItems(complianceRes.value.data?.items || []);
    if (versionsRes.status === "fulfilled") setModelVersions(versionsRes.value.data || null);
    if (hotspotsRes.status === "fulfilled") setGlobalHotspots(hotspotsRes.value.data?.items || []);
  }, []);

  const fetchSystemStatus = useCallback(async () => {
    try {
      const { data } = await api.get("/api/v1/system/status");
      setSystemStatus(data || null);
    } catch {
      setSystemStatus(null);
    }
  }, []);

  const fetchForLocation = useCallback(
    async (selectedLocationId, forceInsight = false) => {
      try {
        const snapshotRes = await api.get(`/api/v1/locations/${selectedLocationId}/snapshot`);
        setSnapshot(snapshotRes.data);
      } catch (snapshotError) {
        const keepExisting = snapshot && String(snapshot.location_id || "") === String(selectedLocationId || "");
        if (!keepExisting) {
          throw snapshotError;
        }
      }

      const settled = await Promise.allSettled([
        api.get(`/api/v1/locations/${selectedLocationId}/risks`),
        api.get(`/api/v1/locations/${selectedLocationId}/risk-features`),
        api.get(`/api/v1/locations/${selectedLocationId}/events`),
        api.get(`/api/v1/locations/${selectedLocationId}/timeseries`, {
          params: { metric: "forecast_temperature_c" },
        }),
        api.get(`/api/v1/locations/${selectedLocationId}/insights`, {
          params: { lang, force_refresh: forceInsight },
        }),
        api.get("/api/v1/locations/rankings", { params: { limit: 8 } }),
      ]);

      if (settled[0].status === "fulfilled") setRiskData(settled[0].value.data);
      if (settled[1].status === "fulfilled") setRiskFeatures(settled[1].value.data?.items || []);
      else setRiskFeatures([]);
      if (settled[2].status === "fulfilled") setEvents(settled[2].value.data?.items || []);
      else setEvents([]);
      if (settled[3].status === "fulfilled") setForecastSeries(settled[3].value.data?.points || []);
      else setForecastSeries([]);
      if (settled[4].status === "fulfilled") setInsight(settled[4].value.data);
      if (settled[5].status === "fulfilled") setGlobalHotspots(settled[5].value.data?.items || []);
    },
    [lang, snapshot],
  );

  const bootstrap = useCallback(async () => {
    setLoading(true);
    setError(null);
    const settled = await Promise.allSettled([fetchLocations(), fetchStaticPanels(), fetchSystemStatus()]);
    const failures = settled.filter((item) => item.status === "rejected");
    if (failures.length) {
      const firstError = failures[0];
      setError(firstError?.reason?.response?.data?.detail || firstError?.reason?.message || "Bootstrap partially failed");
    }
    setLoading(false);
  }, [fetchLocations, fetchStaticPanels, fetchSystemStatus]);

  const refreshData = useCallback(
    async ({ forceInsight = false } = {}) => {
      if (!locationId) return;
      setLoading(true);
      setError(null);
      try {
        await fetchForLocation(locationId, forceInsight);
      } catch (err) {
        setError(err?.response?.data?.detail || "Data fetch failed");
      } finally {
        setLoading(false);
      }
    },
    [locationId, fetchForLocation],
  );

  const createReport = useCallback(async () => {
    if (!locationId) return;
    setReportJob(null);
    const { data } = await api.post("/api/v1/reports", {
      location_id: locationId,
      lang,
    });
    setReportJob(data);
    return data;
  }, [locationId, lang]);

  const pollReport = useCallback(async (reportId) => {
    const { data } = await api.get(`/api/v1/reports/${reportId}`);
    setReportJob(data);
    return data;
  }, []);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    if (!locationId) return;
    refreshData();
  }, [locationId, lang, refreshData]);

  useEffect(() => {
    if (!locationId) return;
    const intervalMs = 15 * 60 * 1000;
    const timer = setInterval(() => {
      refreshData();
    }, intervalMs);
    return () => clearInterval(timer);
  }, [locationId, refreshData]);

  useEffect(() => {
    return subscribeRuntimeStatus((next) => setRuntimeStatus(next));
  }, []);

  const value = useMemo(
    () => ({
      locations,
      locationId,
      setLocationId,
      snapshot,
      riskData,
      riskFeatures,
      events,
      forecastSeries,
      insight,
      sources,
      complianceItems,
      modelVersions,
      globalHotspots,
      reportJob,
      systemStatus,
      runtimeStatus,
      loading,
      error,
      refreshData,
      createReport,
      pollReport,
    }),
    [
      locations,
      locationId,
      snapshot,
      riskData,
      riskFeatures,
      events,
      forecastSeries,
      insight,
      sources,
      complianceItems,
      modelVersions,
      globalHotspots,
      reportJob,
      systemStatus,
      runtimeStatus,
      loading,
      error,
      refreshData,
      createReport,
      pollReport,
    ],
  );

  return <ClimateContext.Provider value={value}>{children}</ClimateContext.Provider>;
}

export function useClimate() {
  const ctx = useContext(ClimateContext);
  if (!ctx) throw new Error("useClimate must be used within ClimateProvider");
  return ctx;
}

import React from "react";
import { useClimate } from "../context/ClimateContext";
import { useI18n } from "../context/I18nContext";
import FeedbackPanel from "../components/FeedbackPanel";
import GovernancePanel from "../components/GovernancePanel";
import InsightPanel from "../components/InsightPanel";
import ReportPanel from "../components/ReportPanel";
import SourcesPanel from "../components/SourcesPanel";
import StrategicRoadmapPanel from "../components/StrategicRoadmapPanel";
import OpportunitiesPanel from "../components/OpportunitiesPanel";

export default function Solutions() {
  const { t } = useI18n();
  const { insight, snapshot, riskData, events, sources, complianceItems, modelVersions, locations, locationId, systemStatus, loading, error } = useClimate();
  const hasRenderableData = Boolean(snapshot || riskData || insight);
  const configuredProviderCount = Array.isArray(systemStatus?.providers)
    ? systemStatus.providers.filter((item) => Boolean(item?.configured)).length
    : 0;
  const aiConnected = configuredProviderCount > 0 || (insight?.provider && String(insight.provider).toLowerCase() !== "fallback");

  if (loading && !hasRenderableData) {
    return <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-8 text-zinc-300">{t("loading")}</div>;
  }
  if (error && !hasRenderableData) {
    return <div className="rounded-2xl border border-red-900 bg-red-950/40 p-8 text-red-300">{String(error)}</div>;
  }

  const activeLocation = locations.find((item) => item.id === locationId);

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.25fr_0.75fr]">
      <InsightPanel
        insight={insight}
        snapshot={snapshot}
        riskData={riskData}
        events={events}
        locationName={activeLocation?.name || snapshot?.location_name || locationId}
        aiConnected={aiConnected}
      />
      <div className="space-y-6">
        <ReportPanel />
        <FeedbackPanel />
        <StrategicRoadmapPanel />
        <OpportunitiesPanel />
        <GovernancePanel complianceItems={complianceItems} modelVersions={modelVersions} />
        <SourcesPanel sources={sources} />
      </div>
    </div>
  );
}

import React, { useEffect, useState } from "react";
import { useClimate } from "../context/ClimateContext";
import { useI18n } from "../context/I18nContext";
import { apiBaseForRequests } from "../api/runtimeConfig";
import { buildExecutiveReportHtml } from "../utils/reportHtml";

const API_BASE = apiBaseForRequests;

export default function ReportPanel() {
  const { createReport, pollReport, reportJob, locations, locationId, snapshot, riskData, insight, events, sources } = useClimate();
  const { t, lang } = useI18n();
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (!running || !reportJob?.id) return;
    if (reportJob.status === "completed" || reportJob.status === "failed") {
      setRunning(false);
      return;
    }

    const timer = setTimeout(async () => {
      await pollReport(reportJob.id);
    }, 2500);

    return () => clearTimeout(timer);
  }, [running, reportJob, pollReport]);

  const onCreate = async () => {
    const job = await createReport();
    if (job?.id) {
      setRunning(true);
    }
  };

  const currentLocation = locations.find((item) => item.id === locationId);
  const locationName = snapshot?.location_name || currentLocation?.name || locationId || "Location";

  const openHtmlReport = (autoPrint = false) => {
    const html = buildExecutiveReportHtml({
      appTitle: t("appTitle"),
      locationName,
      reportJob,
      snapshot,
      riskData,
      insight,
      events,
      sources,
    });

    const popup = window.open("", "_blank", "noopener,noreferrer");
    if (!popup) return;
    popup.document.open();
    popup.document.write(html);
    popup.document.close();
    if (autoPrint) {
      setTimeout(() => {
        popup.focus();
        popup.print();
      }, 250);
    }
  };

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 shadow-xl">
      <h3 className="text-lg font-bold text-zinc-100">{t("report")}</h3>
      <button
        onClick={onCreate}
        className="mt-4 rounded-lg bg-emerald-500 px-4 py-2 font-semibold text-zinc-950 hover:bg-emerald-400"
      >
        {t("createReport")}
      </button>

      {reportJob && (
        <div className="mt-4 rounded-lg border border-zinc-800 bg-zinc-950/50 p-3 text-sm text-zinc-300">
          <p>
            {t("reportStatus")}: <span className="font-semibold text-zinc-100">{reportJob.status}</span>
          </p>
          {typeof reportJob.duration_seconds === "number" && (
            <p className="mt-1 text-xs text-zinc-500">Duration: {reportJob.duration_seconds.toFixed(1)}s</p>
          )}
          {reportJob.output_url && (
            <a href={`${API_BASE}${reportJob.output_url}`} target="_blank" rel="noreferrer" className="mt-2 inline-block text-emerald-400 hover:underline">
              Download PDF
            </a>
          )}
          {reportJob.status === "completed" && (
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => openHtmlReport(false)}
                className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-zinc-100 hover:border-emerald-500"
              >
                {t("openHtmlReport")}
              </button>
              <button
                type="button"
                onClick={() => openHtmlReport(true)}
                className="rounded-md border border-emerald-700 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/20"
              >
                {t("printPdfFromHtml")}
              </button>
            </div>
          )}
          {reportJob.status === "completed" && !reportJob.output_url ? (
            <p className="mt-2 text-xs text-zinc-400">{lang === "tr" ? "Sunucu PDF baglantisi yoksa HTML tabanli rapor acilir." : "When server PDF link is missing, HTML report mode is available."}</p>
          ) : null}
          {reportJob.error_message && <p className="mt-2 text-red-400">{reportJob.error_message}</p>}
        </div>
      )}
    </div>
  );
}

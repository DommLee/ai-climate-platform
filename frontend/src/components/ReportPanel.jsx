import React, { useEffect, useState } from "react";
import { useClimate } from "../context/ClimateContext";
import { useI18n } from "../context/I18nContext";

export default function ReportPanel() {
  const { createReport, pollReport, reportJob } = useClimate();
  const { t } = useI18n();
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
            <a href={`${import.meta.env.VITE_API_BASE_URL || "http://localhost:8000"}${reportJob.output_url}`} target="_blank" rel="noreferrer" className="mt-2 inline-block text-emerald-400 hover:underline">
              Download PDF
            </a>
          )}
          {reportJob.error_message && <p className="mt-2 text-red-400">{reportJob.error_message}</p>}
        </div>
      )}
    </div>
  );
}

import React from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { useI18n } from "../context/I18nContext";
import SafeResponsiveChart from "./SafeResponsiveChart";

export default function TimeseriesChart({ points }) {
  const { t } = useI18n();

  const chartData = (points || []).map((item) => ({
    time: new Date(item.timestamp).toLocaleString(),
    value: Number(item.value),
  }));

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 shadow-xl">
      <h3 className="text-lg font-bold text-zinc-100">{t("forecast")}</h3>
      <SafeResponsiveChart className="mt-4 h-72 w-full min-w-0" placeholder={t("loading")}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
          <XAxis dataKey="time" stroke="#a1a1aa" hide />
          <YAxis stroke="#a1a1aa" />
          <Tooltip contentStyle={{ backgroundColor: "#18181b", border: "1px solid #3f3f46" }} labelStyle={{ color: "#d4d4d8" }} />
          <Line type="monotone" dataKey="value" stroke="#10b981" strokeWidth={2.5} dot={false} />
        </LineChart>
      </SafeResponsiveChart>
    </div>
  );
}

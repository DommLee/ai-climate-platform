function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatThreat(value) {
  return String(value || "climate_stress")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatDate(value) {
  if (!value) return "-";
  const asDate = new Date(value);
  if (Number.isNaN(asDate.getTime())) return "-";
  return asDate.toLocaleString();
}

function numberOrDash(value, digits = 1) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "-";
  return numeric.toFixed(digits);
}

function renderList(items) {
  const safe = Array.isArray(items) ? items.filter(Boolean) : [];
  if (!safe.length) return "<li>No data available.</li>";
  return safe.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
}

export function buildExecutiveReportHtml({
  appTitle,
  locationName,
  reportJob,
  snapshot,
  riskData,
  insight,
  events,
  sources,
  aiEnabled = true,
  aiUnavailableMessage = "Connect AI to see AI-generated commentary.",
  autoPrint = false,
}) {
  const latestRisk = riskData?.latest || snapshot?.risk || {};
  const weather = snapshot?.current_weather || {};
  const recommendations = aiEnabled ? insight?.content?.recommendations || [] : [];
  const action72 = aiEnabled ? insight?.content?.first_72h_action_plan || [] : [];
  const citations = aiEnabled ? insight?.content?.citations || [] : [];
  const recentSignals = (events || []).slice(0, 8);
  const generatedAt = reportJob?.generated_at || snapshot?.generated_at || new Date().toISOString();
  const uncertainty = Array.isArray(latestRisk?.uncertainty_band) ? latestRisk.uncertainty_band : [];
  const summaryText = aiEnabled ? insight?.content?.summary || "Summary not available." : aiUnavailableMessage;
  const rationaleText = aiEnabled ? insight?.content?.risk_rationale || "Rationale not available." : aiUnavailableMessage;

  const printScript = autoPrint
    ? `<script>window.addEventListener("load", function () { setTimeout(function () { window.print(); }, 300); });</script>`
    : "";

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(appTitle)} - ${escapeHtml(locationName)} Report</title>
    <style>
      :root {
        --bg: #0b1020;
        --panel: #111828;
        --panel-soft: #152032;
        --text: #e5edf7;
        --muted: #9fb0c7;
        --accent: #10b981;
        --accent-soft: #0f766e;
        --warning: #f59e0b;
        --danger: #ef4444;
        --border: #243246;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: "Segoe UI", "Inter", "Arial", sans-serif;
        color: var(--text);
        background: radial-gradient(1200px 500px at 20% -10%, #1f3c4f 0%, var(--bg) 60%);
      }
      .page { max-width: 980px; margin: 24px auto; padding: 0 16px 36px; }
      .hero {
        background: linear-gradient(135deg, rgba(16,185,129,0.22), rgba(15,23,42,0.25));
        border: 1px solid var(--border);
        border-radius: 18px;
        padding: 18px 20px;
      }
      h1, h2, h3 { margin: 0 0 8px; }
      h1 { font-size: 26px; }
      h2 { font-size: 20px; margin-top: 18px; }
      h3 { font-size: 16px; margin-top: 12px; }
      .muted { color: var(--muted); }
      .grid { display: grid; gap: 12px; grid-template-columns: repeat(4, minmax(0, 1fr)); margin-top: 14px; }
      .card {
        background: var(--panel);
        border: 1px solid var(--border);
        border-radius: 14px;
        padding: 12px;
      }
      .card .label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); }
      .card .value { font-size: 28px; font-weight: 800; margin-top: 6px; }
      .accent { color: var(--accent); }
      .warning { color: var(--warning); }
      .danger { color: var(--danger); }
      .panel {
        margin-top: 14px;
        background: var(--panel-soft);
        border: 1px solid var(--border);
        border-radius: 14px;
        padding: 14px;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        margin-top: 8px;
        font-size: 14px;
      }
      th, td {
        border-bottom: 1px solid var(--border);
        text-align: left;
        padding: 8px 6px;
      }
      ul { margin: 8px 0 0; padding-left: 18px; }
      li { margin-bottom: 6px; line-height: 1.45; }
      .signals { display: grid; gap: 10px; grid-template-columns: repeat(2, minmax(0, 1fr)); margin-top: 10px; }
      .signal {
        background: #0f172a;
        border: 1px solid var(--border);
        border-radius: 12px;
        padding: 10px;
      }
      .signal-title { font-weight: 600; font-size: 14px; margin: 0 0 6px; }
      .signal-meta { color: var(--muted); font-size: 12px; margin-bottom: 4px; }
      .footer { margin-top: 18px; color: var(--muted); font-size: 12px; }
      @media (max-width: 900px) {
        .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .signals { grid-template-columns: 1fr; }
      }
      @media print {
        body { background: #fff; color: #111; }
        .hero, .card, .panel, .signal { background: #fff; border-color: #d3d9e0; }
        .muted, .signal-meta, .footer { color: #4b5563; }
      }
    </style>
  </head>
  <body>
    <main class="page">
      <section class="hero">
        <h1>${escapeHtml(appTitle)} - Executive Climate Report</h1>
        <p class="muted">${escapeHtml(locationName)} | Generated at ${escapeHtml(formatDate(generatedAt))}</p>
      </section>

      <section class="grid">
        <article class="card">
          <div class="label">Risk Score</div>
          <div class="value accent">${escapeHtml(numberOrDash(latestRisk?.overall))}</div>
        </article>
        <article class="card">
          <div class="label">Primary Threat</div>
          <div class="value warning" style="font-size:20px;">${escapeHtml(formatThreat(latestRisk?.primary_threat))}</div>
        </article>
        <article class="card">
          <div class="label">Confidence</div>
          <div class="value">${escapeHtml(numberOrDash(latestRisk?.confidence))}%</div>
        </article>
        <article class="card">
          <div class="label">Uncertainty</div>
          <div class="value" style="font-size:18px;">${escapeHtml(uncertainty.length ? `[${numberOrDash(uncertainty[0], 2)} - ${numberOrDash(uncertainty[1], 2)}]` : "-")}</div>
        </article>
      </section>

      <section class="panel">
        <h2>Current Weather</h2>
        <table>
          <thead>
            <tr>
              <th>Temperature (C)</th>
              <th>Humidity (%)</th>
              <th>Wind (km/h)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>${escapeHtml(numberOrDash(weather?.temperature_c))}</td>
              <td>${escapeHtml(numberOrDash(weather?.humidity_pct, 0))}</td>
              <td>${escapeHtml(numberOrDash(weather?.wind_kmh))}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section class="panel">
        <h2>Situation Summary</h2>
        <p>${escapeHtml(summaryText)}</p>
        <h3>Risk Rationale</h3>
        <p>${escapeHtml(rationaleText)}</p>
      </section>

      <section class="panel">
        <h2>Recommendations</h2>
        <ul>${renderList(recommendations)}</ul>
        <h3>First 72 Hours Action Plan</h3>
        <ul>${renderList(action72)}</ul>
      </section>

      <section class="panel">
        <h2>Recent Signals</h2>
        <div class="signals">
          ${
            recentSignals.length
              ? recentSignals
                  .map(
                    (item) => `<article class="signal">
              <p class="signal-title">${escapeHtml(item?.title || "Signal")}</p>
              <p class="signal-meta">${escapeHtml(formatDate(item?.occurred_at))} | ${escapeHtml(item?.source || "-")}</p>
              <p>${escapeHtml(item?.summary || "-")}</p>
            </article>`,
                  )
                  .join("")
              : `<article class="signal"><p class="signal-title">No recent signals</p></article>`
          }
        </div>
      </section>

      <section class="panel">
        <h2>Source Attribution</h2>
        <table>
          <thead>
            <tr>
              <th>Source</th>
              <th>Freshness (min)</th>
              <th>Trust</th>
            </tr>
          </thead>
          <tbody>
            ${
              (sources || []).length
                ? sources
                    .map(
                      (item) => `<tr>
                <td>${escapeHtml(item?.id || item?.source || "-")}</td>
                <td>${escapeHtml(numberOrDash(item?.freshness_sla_minutes ?? item?.freshness_minutes, 0))}</td>
                <td>${escapeHtml(numberOrDash(item?.trust_score, 2))}</td>
              </tr>`,
                    )
                    .join("")
                : `<tr><td colspan="3">No source metadata available.</td></tr>`
            }
          </tbody>
        </table>
      </section>

      <section class="panel">
        <h2>Citations</h2>
        <ul>
          ${
            citations.length
              ? citations
                  .map(
                    (item) =>
                      `<li>${escapeHtml(item?.source || "source")} - ${escapeHtml(formatDate(item?.timestamp_utc))} - ${escapeHtml(item?.source_url || "-")}</li>`,
                  )
                  .join("")
              : "<li>No citations available.</li>"
          }
        </ul>
      </section>

      <p class="footer">Report ID: ${escapeHtml(reportJob?.id || "-")} | Generated by AI Climate Platform</p>
    </main>
    ${printScript}
  </body>
</html>`;
}

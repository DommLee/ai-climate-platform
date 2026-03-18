import React from "react";

export default function GovernancePanel({ complianceItems, modelVersions }) {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 shadow-xl">
        <h3 className="text-lg font-bold text-zinc-100">Model Governance</h3>
        {modelVersions ? (
          <div className="mt-3 space-y-1 text-sm text-zinc-300">
            <p>Prompt Version: <span className="font-semibold text-zinc-100">{modelVersions.prompt_version}</span></p>
            <p>Primary: <span className="font-semibold text-zinc-100">{modelVersions.primary?.provider} / {modelVersions.primary?.model}</span></p>
            <p>Secondary: <span className="font-semibold text-zinc-100">{modelVersions.secondary?.provider} / {modelVersions.secondary?.model}</span></p>
          </div>
        ) : (
          <p className="mt-3 text-sm text-zinc-400">No governance metadata yet.</p>
        )}
      </div>

      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 shadow-xl">
        <h3 className="text-lg font-bold text-zinc-100">Compliance Checklist</h3>
        <ul className="mt-3 space-y-2 text-sm">
          {(complianceItems || []).map((item) => (
            <li key={item.id} className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-3">
              <p className="font-semibold text-zinc-100">{item.title}</p>
              <p className="text-zinc-300">Status: {item.status}</p>
              <p className="text-zinc-400">{item.evidence}</p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

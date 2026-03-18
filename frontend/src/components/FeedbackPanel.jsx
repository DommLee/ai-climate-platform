import React, { useState } from "react";
import { api } from "../api/client";
import { useClimate } from "../context/ClimateContext";

export default function FeedbackPanel() {
  const { locationId } = useClimate();
  const [rating, setRating] = useState(4);
  const [comment, setComment] = useState("");
  const [status, setStatus] = useState("");

  const submit = async () => {
    setStatus("");
    try {
      await api.post("/api/v1/feedback", {
        location_id: locationId,
        rating,
        comment,
        correction: {},
      });
      setStatus("Feedback saved.");
      setComment("");
    } catch {
      setStatus("Feedback failed.");
    }
  };

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 shadow-xl">
      <h3 className="text-lg font-bold text-zinc-100">Feedback Loop</h3>
      <p className="mt-2 text-sm text-zinc-300">Share correction signals to improve future insights.</p>

      <div className="mt-3 flex items-center gap-2">
        <label className="text-sm text-zinc-300">Rating</label>
        <select value={rating} onChange={(e) => setRating(Number(e.target.value))} className="rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1 text-sm">
          {[1, 2, 3, 4, 5].map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
      </div>

      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Optional comment"
        className="mt-3 h-20 w-full rounded-md border border-zinc-700 bg-zinc-950 p-2 text-sm"
      />

      <button onClick={submit} className="mt-3 rounded-md bg-emerald-500 px-3 py-2 text-sm font-semibold text-zinc-950 hover:bg-emerald-400">
        Submit Feedback
      </button>

      {status && <p className="mt-2 text-xs text-zinc-400">{status}</p>}
    </div>
  );
}

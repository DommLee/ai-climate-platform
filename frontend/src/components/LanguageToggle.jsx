import React from "react";
import { useI18n } from "../context/I18nContext";

export default function LanguageToggle() {
  const { lang, setLang } = useI18n();

  return (
    <div className="inline-flex rounded-lg border border-zinc-700 bg-zinc-900 p-1">
      {["tr", "en"].map((code) => (
        <button
          key={code}
          onClick={() => setLang(code)}
          className={`px-3 py-1 text-xs font-semibold uppercase rounded-md transition ${
            lang === code ? "bg-emerald-500 text-zinc-950" : "text-zinc-300 hover:text-white"
          }`}
        >
          {code}
        </button>
      ))}
    </div>
  );
}

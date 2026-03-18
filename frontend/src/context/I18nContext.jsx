import React, { createContext, useContext, useMemo, useState } from "react";
import { translations } from "../i18n/translations";

const I18nContext = createContext(null);

export function I18nProvider({ children }) {
  const browserLang = (typeof navigator !== "undefined" ? navigator.language : "en").toLowerCase();
  const initialLang = browserLang.startsWith("tr") ? "tr" : "en";
  const [lang, setLang] = useState(initialLang);

  const t = useMemo(() => {
    const dict = translations[lang] || translations.en;
    return (key) => dict[key] || key;
  }, [lang]);

  const value = useMemo(() => ({ lang, setLang, t }), [lang, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}

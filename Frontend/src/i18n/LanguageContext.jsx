import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import i18n from "./i18n";

const STORAGE_KEY = "app_language";

const LanguageContext = createContext(null);

export function LanguageProvider({ children }) {
  const { t: i18n_t } = useTranslation();
  const [language, setLanguageState] = useState(() => i18n.language || localStorage.getItem(STORAGE_KEY) || "vi");

  const setLanguage = (newLang) => {
    i18n.changeLanguage(newLang);
    setLanguageState(newLang);
    localStorage.setItem(STORAGE_KEY, newLang);
    document.documentElement.lang = newLang;
    document.documentElement.dataset.lang = newLang;
  };

  useEffect(() => {
    const currentLang = i18n.language || "vi";
    document.documentElement.lang = currentLang;
    document.documentElement.dataset.lang = currentLang;
  }, []);

  const value = useMemo(() => ({
    language,
    setLanguage,
    toggleLanguage: () => setLanguage(language === "vi" ? "en" : "vi"),
    t: (key, options) => i18n_t(key, options),
  }), [language, i18n_t]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    return { 
      language: i18n.language || "vi", 
      setLanguage: (l) => i18n.changeLanguage(l), 
      toggleLanguage: () => i18n.changeLanguage(i18n.language === "vi" ? "en" : "vi"), 
      t: (key, options) => i18n.t(key, options) 
    };
  }
  return context;
}

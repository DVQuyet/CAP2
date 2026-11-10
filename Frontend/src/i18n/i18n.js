import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";

const STORAGE_KEY = "app_language";

// Bản dịch tải theo nhu cầu: người dùng tiếng Việt không phải tải en.json (và ngược lại) -> bundle vào trang nhẹ hơn.
const loaders = {
  vi: () => import("./locales/vi.json"),
  en: () => import("./locales/en.json"),
};

const lazyLocaleBackend = {
  type: "backend",
  init() {},
  read(language, namespace, callback) {
    const load = loaders[language];
    if (!load) {
      callback(null, {});
      return;
    }
    load().then((module) => callback(null, module.default), (error) => callback(error, false));
  },
};

// main.jsx chờ promise này xong rồi mới render để không nháy khóa dịch.
export const i18nReady = i18n
  .use(lazyLocaleBackend)
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    fallbackLng: "vi",
    supportedLngs: ["vi", "en"],
    ns: ["translation"],
    defaultNS: "translation",
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ["localStorage", "navigator"],
      lookupLocalStorage: STORAGE_KEY,
      caches: ["localStorage"],
    },
  });

export default i18n;

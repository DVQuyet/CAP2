import { useTranslation } from "react-i18next";
import { useLanguage } from "../../i18n/LanguageContext";
import "./LanguageToggle.css";

export default function LanguageToggle({ className = "", showIcon = true }) {
  const { language, setLanguage, toggleLanguage } = useLanguage();
  const { i18n, t } = useTranslation();
  const currentLanguage = i18n.resolvedLanguage || language;
  const nextLanguage = currentLanguage === "vi" ? "en" : "vi";
  const nextLabel = nextLanguage === "en" ? t("language.english") : t("language.vietnamese");

  const handleToggle = () => {
    i18n.changeLanguage(nextLanguage);
    if (typeof setLanguage === "function") {
      setLanguage(nextLanguage);
      return;
    }
    toggleLanguage();
  };

  return (
    <button
      type="button"
      className={`language-toggle ${className}`.trim()}
      onClick={handleToggle}
      title={t("language.switchTo", { language: nextLabel })}
      aria-label={t("language.switchTo", { language: nextLabel })}
      data-no-translate="true"
    >
      {showIcon && <span className="material-symbols-outlined">translate</span>}
      <strong>{currentLanguage === "vi" ? "VI" : "EN"}</strong>
    </button>
  );
}

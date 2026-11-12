import { formatLunarFullFromSolar } from "../../../../shared/utils/lunarCalendar";
import { useLanguage } from "../../../../i18n/LanguageContext";

export default function LunarDateHint({ value, label }) {
  const { t } = useLanguage();
  const text = formatLunarFullFromSolar(value);
  if (!text) return null;
  const displayLabel = label || t("tree.inspector.fields.lunarBirth");
  return <small className="fte-lunarHint">{displayLabel}: {text}</small>;
}

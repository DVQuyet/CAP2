import { useTranslation } from "react-i18next";

export default function TypingIndicator() {
  const { t } = useTranslation();
  return (
    <div className="ai-typing" role="status" aria-label={t("aiChat.typing")}>
      <span />
      <span />
      <span />
    </div>
  );
}

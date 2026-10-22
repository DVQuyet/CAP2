import { useTranslation } from "react-i18next";

export default function SuggestionChips({ suggestions = [], onPick, disabled = false }) {
  const { t } = useTranslation();
  if (!suggestions.length) return null;

  return (
    <div className="ai-suggestion-chips" role="group" aria-label={t("aiChat.suggestionsLabel")}>
      {suggestions.slice(0, 8).map((item) => (
        <button
          key={item.id || item.text}
          type="button"
          className="ai-suggestion-chip"
          disabled={disabled}
          onClick={() => onPick?.(item.text)}
        >
          {item.text}
        </button>
      ))}
    </div>
  );
}

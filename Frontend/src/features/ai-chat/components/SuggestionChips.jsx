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
          {item.intent_hint === "create_event_draft" && (
            <svg className="ai-suggestion-chip-icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="4" width="18" height="18" rx="2" />
              <path d="M16 2v4M8 2v4M3 10h18" />
            </svg>
          )}
          <span className="ai-suggestion-chip-text">{item.text}</span>
          {item.hint && <span className="ai-suggestion-chip-hint">{item.hint}</span>}
        </button>
      ))}
    </div>
  );
}

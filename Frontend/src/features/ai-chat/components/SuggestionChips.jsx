export default function SuggestionChips({ suggestions = [], onPick }) {
  if (!suggestions.length) return null;

  return (
    <div className="ai-suggestion-chips" aria-label="Gợi ý câu hỏi">
      {suggestions.slice(0, 8).map((item) => (
        <button
          key={item.id || item.text}
          type="button"
          className="ai-suggestion-chip"
          onClick={() => onPick?.(item.text)}
        >
          {item.text}
        </button>
      ))}
    </div>
  );
}

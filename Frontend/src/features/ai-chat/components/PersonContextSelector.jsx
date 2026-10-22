import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

export default function PersonContextSelector({ people = [], loading, error, onSelect }) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [savingId, setSavingId] = useState(null);

  const filteredPeople = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return people.slice(0, 80);
    return people
      .filter((person) => String(person.name || person.display_name || "").toLowerCase().includes(normalized))
      .slice(0, 80);
  }, [people, query]);

  const handleSelect = async (person) => {
    setSavingId(person.id);
    try {
      await onSelect?.(person);
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="ai-context-selector">
      <div className="ai-context-title">
        <span className="material-symbols-outlined" aria-hidden="true">person_search</span>
        <div>
          <strong>{t("aiChat.selectorTitle")}</strong>
          <small>{t("aiChat.selectorHint")}</small>
        </div>
      </div>
      {error ? <div className="ai-context-error">{error}</div> : null}
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={t("aiChat.selectorSearch")}
        aria-label={t("aiChat.selectorSearch")}
        className="ai-context-search"
      />
      <div className="ai-context-list">
        {loading ? <div className="ai-context-muted">{t("aiChat.selectorLoading")}</div> : null}
        {!loading && !filteredPeople.length ? (
          <div className="ai-context-muted">{t("aiChat.selectorEmpty")}</div>
        ) : null}
        {filteredPeople.map((person) => (
          <button
            key={person.id}
            type="button"
            className="ai-context-person"
            onClick={() => handleSelect(person)}
            disabled={savingId === person.id}
          >
            <span>{person.name || person.display_name}</span>
            <small>{person.generation ? t("aiChat.generation", { n: person.generation }) : t("aiChat.generationUnknown")}</small>
          </button>
        ))}
      </div>
    </div>
  );
}

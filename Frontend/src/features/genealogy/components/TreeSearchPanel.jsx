import { useLanguage } from "../../../i18n/LanguageContext";

const asArray = (value) => (Array.isArray(value) ? value : []);

function personName(person, fallback) {
  return person?.display_name || [person?.surname, person?.middle_name, person?.first_name].filter(Boolean).join(" ").trim() || fallback;
}

export default function TreeSearchPanel({
  variant = "",
  query,
  onQueryChange,
  onSubmit,
  onClear,
  results = [],
  submittedQuery,
  onResultClick,
  onFindMe,
  findMeDisabled = false,
  showFindMe = true,
  showClear = true,
}) {
  const { t } = useLanguage();
  const hasSubmitted = String(submittedQuery || "").trim().length > 0;

  return (
    <div className={`fte-searchPanel ${variant ? `fte-searchPanel--${variant}` : ""}`}>
      <form
        className="fte-searchForm"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit?.();
        }}
      >
        <label>
          <span>{t("tree.sidebar.title")}</span>
          <input
            type="search"
            value={query}
            placeholder={t("tree.sidebar.placeholder")}
            onChange={(event) => onQueryChange?.(event.target.value)}
          />
        </label>
        <button type="submit" className="fte-iconButton" title={t("tree.sidebar.search")}>
          <span className="material-symbols-outlined">search</span>
        </button>
        {showFindMe ? (
          <button
            type="button"
            className="fte-iconButton"
            onClick={onFindMe}
            disabled={findMeDisabled}
            title={t("tree.sidebar.findMe")}
          >
            <span className="material-symbols-outlined">my_location</span>
          </button>
        ) : null}
        {showClear ? (
          <button type="button" className="fte-iconButton" onClick={onClear} title={t("common.close")}>
            <span className="material-symbols-outlined">close</span>
          </button>
        ) : null}
      </form>

      {hasSubmitted ? (
        <div className="fte-searchResults">
          {asArray(results).length ? (
            asArray(results).map((person) => (
              <button key={person.id} type="button" onClick={() => onResultClick?.(person)}>
                <strong>{personName(person, t("tree.card.fallbackName"))}</strong>
                <small>{t("tree.card.generation", { count: person.generation || 1 })}{person.birth_date ? ` - ${person.birth_date}` : ""}</small>
              </button>
            ))
          ) : (
            <span>{t("tree.sidebar.noResults")}</span>
          )}
        </div>
      ) : null}
    </div>
  );
}


import { useMemo, useState } from "react";
import { useLanguage } from "../../../i18n/LanguageContext";
import { normalizeSearchText } from "../hooks/useTreeSearch";

const asArray = (value) => (Array.isArray(value) ? value : []);

function personLabel(person) {
  return person?.display_name || [person?.surname, person?.middle_name, person?.first_name].filter(Boolean).join(" ").trim() || `#${person?.id}`;
}

export default function TreeViewModeSelector({
  variant = "",
  people = [],
  mode,
  rootPersonId,
  onFullMode,
  onRootMode,
}) {
  const { t } = useLanguage();
  const [rootQuery, setRootQuery] = useState("");
  const rootPerson = asArray(people).find((person) => Number(person.id) === Number(rootPersonId));
  const rootResults = useMemo(() => {
    const q = normalizeSearchText(rootQuery);
    return asArray(people)
      .slice()
      .sort((a, b) => normalizeSearchText(personLabel(a)).localeCompare(normalizeSearchText(personLabel(b))))
      .filter((person) => {
        if (!q) return true;
        return normalizeSearchText(`${personLabel(person)} doi ${person.generation || 1} generation ${person.generation || 1}`).includes(q);
      })
      .slice(0, 8);
  }, [people, rootQuery]);

  return (
    <div className={`fte-viewMode ${variant ? `fte-viewMode--${variant}` : ""}`}>
      {variant === "rootOnly" ? null : (
      <button type="button" className={mode === "full" ? "is-active" : ""} onClick={onFullMode}>
        <span className="material-symbols-outlined">account_tree</span>
        {t("tree.viewMode.full")}
      </button>
      )}
      <div className="fte-rootPicker">
        <label>
          <span>{t("tree.viewMode.setRoot")}</span>
          <input
            type="search"
            value={rootQuery}
            placeholder={t("tree.viewMode.rootPlaceholder")}
            onChange={(event) => setRootQuery(event.target.value)}
          />
          {variant === "rootOnly" ? (
            <button
              type="button"
              className={mode === "full" ? "is-active" : ""}
              onClick={onFullMode}
              title={t("tree.viewMode.full")}
            >
              <span className="material-symbols-outlined">account_tree</span>
            </button>
          ) : null}
        </label>
        <div className="fte-rootPickerResults">
          {rootResults.map((person) => (
            <button
              key={person.id}
              type="button"
              className={Number(rootPersonId) === Number(person.id) ? "is-selected" : ""}
               onClick={() => {
                onRootMode(Number(person.id));
                setRootQuery(personLabel(person));
              }}
            >
              <strong>{personLabel(person)}</strong>
              <small>{t("tree.card.generation", { count: person.generation || 1 })}</small>
            </button>
          ))}
        </div>
      </div>
      {mode === "root" && rootPerson ? (
        <span className="fte-viewModeRoot">{t("tree.viewMode.rootLabel", { name: personLabel(rootPerson) })}</span>
      ) : null}
    </div>
  );
}


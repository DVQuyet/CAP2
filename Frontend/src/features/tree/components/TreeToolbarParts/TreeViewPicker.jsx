import { useMemo, useState } from "react";
import { useLanguage } from "../../../../i18n/LanguageContext";
import { normalizeSearchText } from "../../hooks/useTreeSearch";

// Chọn phần cây đang xem: cả dòng họ, hoặc dòng của một người (tổ tiên, con cháu, vợ chồng).
// Danh sách người hiện sẵn (theo đời rồi theo tên), gõ để lọc; dùng chung cho máy tính và điện thoại.
const LIST_LIMIT = 40;
const asArray = (value) => (Array.isArray(value) ? value : []);

function personLabel(person) {
  return person?.display_name || [person?.surname, person?.middle_name, person?.first_name].filter(Boolean).join(" ").trim() || `#${person?.id}`;
}

function useSortedPeople(people) {
  return useMemo(() => asArray(people)
    .map((person) => ({ person, label: personLabel(person), key: normalizeSearchText(personLabel(person)) }))
    .sort((a, b) => (a.person.generation || 1) - (b.person.generation || 1) || a.key.localeCompare(b.key)), [people]);
}

export default function TreeViewPicker({ people = [], mode, rootPersonId, onFullMode, onRootMode }) {
  const { t } = useLanguage();
  const [query, setQuery] = useState("");
  const [pickingRoot, setPickingRoot] = useState(mode === "root");
  const sorted = useSortedPeople(people);
  const results = useMemo(() => {
    const q = normalizeSearchText(query);
    const rows = q ? sorted.filter((row) => `${row.key} doi ${row.person.generation || 1}`.includes(q)) : sorted;
    return rows.slice(0, LIST_LIMIT);
  }, [query, sorted]);
  const showList = pickingRoot || mode === "root";

  return (
    <div className="tvp">
      <div className="tvp-options" role="radiogroup" aria-label={t("tree.viewMode.title")}>
        <button type="button" role="radio" aria-checked={mode !== "root" && !pickingRoot} className="tvp-option" onClick={onFullMode}>
          <span className="material-symbols-outlined" aria-hidden="true">groups</span>
          <span className="tvp-optionText">
            <strong>{t("tree.viewMode.wholeClan")}</strong>
            <small>{t("tree.viewMode.wholeClanHint")}</small>
          </span>
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={mode === "root"}
          className={`tvp-option ${pickingRoot && mode !== "root" ? "is-picking" : ""}`}
          onClick={() => setPickingRoot(true)}
        >
          <span className="material-symbols-outlined" aria-hidden="true">account_tree</span>
          <span className="tvp-optionText">
            <strong>{t("tree.viewMode.byPerson")}</strong>
            <small>{t("tree.viewMode.byPersonHint")}</small>
          </span>
        </button>
      </div>

      {showList ? (
        <div className="tvp-picker">
          <input
            type="search"
            value={query}
            autoFocus={pickingRoot && mode !== "root"}
            placeholder={t("tree.viewMode.rootPlaceholder")}
            aria-label={t("tree.viewMode.rootPlaceholder")}
            onChange={(event) => setQuery(event.target.value)}
          />
          <ul className="tvp-list" aria-label={t("tree.viewMode.byPerson")}>
            {results.map(({ person, label }) => {
              const selected = mode === "root" && Number(rootPersonId) === Number(person.id);
              return (
                <li key={person.id}>
                  <button type="button" aria-current={selected || undefined} onClick={() => onRootMode(Number(person.id))}>
                    <span>{label}</span>
                    <small>{t("tree.card.generation", { count: person.generation || 1 })}</small>
                    {selected ? <span className="material-symbols-outlined" aria-hidden="true">check</span> : null}
                  </button>
                </li>
              );
            })}
            {results.length === 0 ? <li className="tvp-empty">{t("tree.viewMode.noMatch")}</li> : null}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

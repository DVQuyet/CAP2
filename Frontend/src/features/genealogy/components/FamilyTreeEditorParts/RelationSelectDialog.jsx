import { useState } from "react";
import { useLanguage } from "../../../../i18n/LanguageContext";
import { fullName } from "../../utils/tree-editor/treePersonUtils";
import { relationCandidates, relationLinkedIds } from "../../utils/tree-editor/treeRelations";

export default function RelationSelectDialog({
  relation,
  selectedPerson,
  people,
  families,
  childRows,
  value,
  onChange,
  onCancel,
  onSubmit,
  onUnlink,
  onPickOnTree,
  saving,
}) {
  const { t } = useLanguage();
  const [query, setQuery] = useState("");
  if (!relation || !selectedPerson) return null;

  const linkedIds = relationLinkedIds(relation, selectedPerson, families, childRows);
  const candidates = relationCandidates(relation, selectedPerson, people, linkedIds, families);
  const normalizedQuery = query.trim().toLowerCase();
  const filtered = candidates.filter((person) => {
    if (!normalizedQuery) return true;
    return `${fullName(person)} ${person.email || ""} ${person.phone || ""}`.toLowerCase().includes(normalizedQuery);
  });
  const title = t(`tree.relationModal.titles.${relation}`) || t("tree.relationModal.titles.generic");
  const selectedLinked = linkedIds.has(Number(value));
  const canUnlink = linkedIds.size > 0 && (relation !== "child" || selectedLinked);

  return (
    <div className="fte-modalOverlay" role="presentation" onMouseDown={onCancel}>
      <div className="fte-modal fte-relationModal" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
        <div className="fte-modalHeader">
          <div>
            <span>{fullName(selectedPerson, t("tree.card.fallbackName"))}</span>
            <h3>{title}</h3>
          </div>
          <button type="button" className="fte-iconButton" onClick={onCancel} title={t("common.close")}>
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="fte-relationPicker">
          <button type="button" className="fte-pickOnTreeButton" disabled={saving} onClick={onPickOnTree}>
            <span className="material-symbols-outlined">account_tree</span>
            {t("tree.relationModal.pickOnTree")}
          </button>
          <div className="fte-relationDivider"><span>{t("tree.relationModal.divider")}</span></div>
          <label>
            {t("tree.relationModal.searchLabel")}
            <input
              autoFocus
              value={query}
              placeholder={t("tree.relationModal.searchPlaceholder")}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <div className="fte-relationList">
            {filtered.length ? (
              filtered.map((person) => (
                <button
                  key={person.id}
                  type="button"
                  className={`fte-relationOption ${Number(value) === Number(person.id) ? "is-selected" : ""} ${
                    linkedIds.has(Number(person.id)) ? "is-linked" : ""
                  }`}
                  onClick={() => onChange(person.id)}
                >
                  <span className="fte-relationAvatar">
                    {person.avatar_url ? <img src={person.avatar_url} alt={fullName(person)} /> : fullName(person).charAt(0).toUpperCase()}
                  </span>
                  <span>
                    <strong>{fullName(person, t("tree.card.fallbackName"))}</strong>
                    <small>
                      {t("tree.card.generation", { count: person.generation || "?" })}
                      {person.gender ? ` · ${Number(person.gender) === 1 ? t("tree.inspector.fields.genderOptions.male") : t("tree.inspector.fields.genderOptions.female")}` : ""}
                    </small>
                  </span>
                  {linkedIds.has(Number(person.id)) ? <em>{t("tree.relationModal.isLinked")}</em> : null}
                </button>
              ))
            ) : (
              <div className="fte-relationEmpty">{t("tree.relationModal.noResults")}</div>
            )}
          </div>
        </div>

        <div className="fte-modalFooter">
          <button type="button" className="fte-dangerButton" disabled={saving || !canUnlink} onClick={onUnlink}>
            <span className="material-symbols-outlined">link_off</span>
            {t("tree.relationModal.actions.unlink")}
          </button>
          <button type="button" className="fte-primaryButton" disabled={saving || !value} onClick={onSubmit}>
            <span className="material-symbols-outlined">link</span>
            {saving ? t("tree.relationModal.actions.linking") : t("tree.relationModal.actions.link")}
          </button>
          <button type="button" className="fte-ghostButton" disabled={saving} onClick={onCancel}>
            {t("common.cancel")}
          </button>
        </div>
      </div>
    </div>
  );
}

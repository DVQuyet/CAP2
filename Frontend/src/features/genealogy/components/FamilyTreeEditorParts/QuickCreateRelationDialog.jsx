import { useLanguage } from "../../../../i18n/LanguageContext";
import { fullName } from "../../utils/tree-editor/treePersonUtils";

export default function QuickCreateRelationDialog({
  sourcePerson,
  onChoose,
  onCancel,
}) {
  const { t } = useLanguage();
  if (!sourcePerson) return null;

  return (
    <div className="fte-modalOverlay" role="presentation" onMouseDown={onCancel}>
      <div
        className="fte-modal fte-quickCreateModal"
        role="dialog"
        aria-modal="true"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="fte-modalHeader">
          <div>
            <span>{fullName(sourcePerson, t("tree.card.fallbackName"))}</span>
            <h3>{t("tree.quickCreate.title")}</h3>
          </div>
          <button type="button" className="fte-iconButton" onClick={onCancel} title={t("common.close")}>
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="fte-quickCreateChoices">
          <button
            type="button"
            className="fte-quickCreateChoice"
            onClick={() => onChoose("spouse")}
          >
            <span className="material-symbols-outlined">favorite</span>
            <strong>{t("tree.quickCreate.spouse.title")}</strong>
            <small>{t("tree.quickCreate.spouse.desc")}</small>
          </button>

          <button
            type="button"
            className="fte-quickCreateChoice"
            onClick={() => onChoose("child")}
          >
            <span className="material-symbols-outlined">person_add</span>
            <strong>{t("tree.quickCreate.child.title")}</strong>
            <small>{t("tree.quickCreate.child.desc")}</small>
          </button>
        </div>

        <div className="fte-modalFooter">
          <button type="button" className="fte-ghostButton" onClick={onCancel}>
            {t("common.cancel")}
          </button>
        </div>
      </div>
    </div>
  );
}

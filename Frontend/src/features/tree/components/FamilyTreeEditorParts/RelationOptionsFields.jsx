import { useLanguage } from "../../../../i18n/LanguageContext";
import { fullName } from "../../utils/tree-editor/treePersonUtils";
import {
  CHILD_TYPE_OPTIONS,
  PARENT_LINK_TYPE_OPTIONS,
  RELATIONSHIP_STATUS_OPTIONS,
  UNION_TYPE_OPTIONS,
  getUnionOptionsForPerson,
} from "../../utils/tree-editor/treeRelations";

// Tùy chọn của quan hệ: con với ai + loại con; loại hôn nhân + trạng thái; cha mẹ ruột hay nuôi/thừa tự.
export default function RelationOptionsFields({ relation, sourcePerson, families, people, value = {}, onChange, disabled = false }) {
  const { t } = useLanguage();
  if (!sourcePerson || !relation || relation === "person" || !onChange) return null;
  const set = (patch) => onChange?.({ ...value, ...patch });

  if (relation === "child") {
    const unionOptions = getUnionOptionsForPerson(sourcePerson.id, families, people);
    const unknownLabel = Number(sourcePerson.gender) === 2
      ? t("tree.relationOptions.unknownFather")
      : t("tree.relationOptions.unknownMother");
    return (
      <div className="fte-relationOptions">
        <label>
          {t("tree.relationOptions.childWith")}
          <select value={value.unionKey || ""} disabled={disabled} onChange={(event) => set({ unionKey: event.target.value })}>
            {!value.unionKey ? <option value="">{t("tree.relationOptions.chooseUnion")}</option> : null}
            {unionOptions.map((option) => (
              <option key={option.key} value={option.key}>
                {option.spouse
                  ? t("tree.relationOptions.withSpouse", {
                    name: fullName(option.spouse, t("tree.card.fallbackName")),
                    status: t(`tree.relationOptions.statuses.${option.status}`),
                    rank: option.rank ? t("tree.relationOptions.rankSuffix", { count: option.rank }) : "",
                  })
                  : unknownLabel}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("tree.relationOptions.childType")}
          <select value={value.childType || "biological"} disabled={disabled} onChange={(event) => set({ childType: event.target.value })}>
            {CHILD_TYPE_OPTIONS.map((type) => (
              <option key={type} value={type}>{t(`tree.relationOptions.childTypes.${type}`)}</option>
            ))}
          </select>
        </label>
        {!value.unionKey ? <p className="fte-relationOptionsHint">{t("tree.relationOptions.chooseUnionHint")}</p> : null}
      </div>
    );
  }

  if (relation === "spouse") {
    return (
      <div className="fte-relationOptions">
        <label>
          {t("tree.relationOptions.unionType")}
          <select value={value.unionType || "marriage"} disabled={disabled} onChange={(event) => set({ unionType: event.target.value })}>
            {UNION_TYPE_OPTIONS.map((type) => (
              <option key={type} value={type}>{t(`tree.relationOptions.unionTypes.${type}`)}</option>
            ))}
          </select>
        </label>
        <label>
          {t("tree.relationOptions.relationshipStatus")}
          <select value={value.relationshipStatus || "active"} disabled={disabled} onChange={(event) => set({ relationshipStatus: event.target.value })}>
            {RELATIONSHIP_STATUS_OPTIONS.map((status) => (
              <option key={status} value={status}>{t(`tree.relationOptions.statuses.${status}`)}</option>
            ))}
          </select>
        </label>
      </div>
    );
  }

  if (relation === "father" || relation === "mother") {
    return (
      <div className="fte-relationOptions">
        <label>
          {t("tree.relationOptions.parentType")}
          <select value={value.parentType || "biological"} disabled={disabled} onChange={(event) => set({ parentType: event.target.value })}>
            {PARENT_LINK_TYPE_OPTIONS.map((type) => (
              <option key={type} value={type}>{t(`tree.relationOptions.parentTypes.${type}`)}</option>
            ))}
          </select>
        </label>
      </div>
    );
  }

  return null;
}

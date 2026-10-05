import { useLanguage } from "../../../i18n/LanguageContext";
import { fullName } from "../utils/tree-editor/treePersonUtils";

// Thẻ tham chiếu: người này được vẽ ở vị trí chính nơi khác trên cây (con nuôi/thừa tự tại nhà cha mẹ đẻ,
// con gái lấy chồng thuộc nhánh khác trong họ...). Bấm để chuyển tới vị trí chính.
export default function ReferenceCard({ node, related = false, dimmed = false, onOpen }) {
  const { t } = useLanguage();
  const person = node?.person;
  const typeKey = ["adopted", "heir", "step", "foster"].includes(node?.childType) ? node.childType : "elsewhere";
  return (
    <button
      type="button"
      id={`fte-display-${node.id}`}
      className={`fte-referenceCard ${related ? "is-related" : ""} ${dimmed ? "is-dimmed" : ""}`}
      style={{ left: node.x, top: node.y, width: node.width, height: node.height }}
      title={t("tree.reference.goTo", { name: fullName(person, t("tree.card.fallbackName")) })}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        onOpen?.(person?.id);
      }}
    >
      <span className="material-symbols-outlined" aria-hidden="true">move_down</span>
      <span className="fte-referenceText">
        <strong>{fullName(person, t("tree.card.fallbackName"))}</strong>
        <small>{t(`tree.reference.types.${typeKey}`)}</small>
      </span>
    </button>
  );
}

import { memo } from "react";
import { useLanguage } from "../../../i18n/LanguageContext";
import { getPersonHighlightState, highlightClassNames } from "../utils/treeHighlight";
import { CARD_HEIGHT, CARD_WIDTH, NAME_FONT_SIZE } from "../model/config.js";
import { TREE_DISPLAY_MODE, getTreeDisplayConfig } from "../utils/tree-editor/treeDisplayConfig";
import { useCardActive } from "../hooks/useCardActive";
import { nodeTransform } from "../hooks/useNodeDrag";
import { cardExtraInfo, cardMeta } from "../utils/tree-editor/treeCardInfo";
import { CardPersonBody } from "./TreeCardParts";
import TreeCardToolbar from "./TreeCardToolbar";

function fullName(person, fallback) {
  return person?.display_name || [person?.surname, person?.middle_name, person?.first_name].filter(Boolean).join(" ").trim() || fallback;
}

// React.memo: mọi prop là giá trị nguyên thủy, Set/Map đã memo ở cha, hoặc hàm ổn định (useStableCallback),
// nên chọn/kéo một thẻ không làm cả nghìn thẻ khác vẽ lại.
export default memo(TreeNodeCard);

function TreeNodeCard({
  person,
  x = 0,
  y = 0,
  selected,
  dragging,
  canDrag = true,
  canEdit = false,
  canDelete = false,
  founder = false,
  directLineage = false,
  width = CARD_WIDTH,
  height = CARD_HEIGHT,
  displayMode = TREE_DISPLAY_MODE.DETAIL,
  cardOrientation = "horizontal",
  fontSize,
  related = false,
  dimmed = false,
  hasChildren = false,
  hasAncestors = false,
  collapsed = false,
  ancestorsCollapsed = false,
  highlightOptions = {},
  onPointerDown,
  onResizePointerDown,
  onEdit,
  onDelete,
  onQuickCreate,
  onToggleCollapse,
  onToggleDescendants,
  onToggleAncestors,
}) {
  const { t } = useLanguage();
  const [active, activeHandlers] = useCardActive();
  const name = fullName(person, t("tree.card.fallbackName"));
  const genderClass = Number(person.gender) === 1 ? "is-male" : Number(person.gender) === 2 ? "is-female" : "is-unknown";
  const deceased = Number(person.is_living) === 0;
  const isClanChief = Number(person.role_id) === 2;
  const state = getPersonHighlightState(person, { ...highlightOptions, selectedPersonId: selected ? person.id : highlightOptions.selectedPersonId });
  const stateClasses = highlightClassNames(state);
  const badges = [
    state.self ? t("tree.card.badges.self") : "",
    state.online ? t("tree.card.badges.online") : "",
    state.search ? t("tree.card.badges.search") : "",
    state.editing ? t("tree.card.badges.editing") : "",
    state.error ? t("tree.card.badges.error") : "",
  ].filter(Boolean);
  const displayConfig = getTreeDisplayConfig(displayMode);
  const resolvedFontSize = Number(fontSize) || displayConfig.singleNameFontSize || displayConfig.nameFontSize || NAME_FONT_SIZE;
  const detail = displayMode !== TREE_DISPLAY_MODE.OVERVIEW;
  const meta = detail && displayConfig.showMeta !== false ? cardMeta(person, t) : "";
  const tooltipLines = [
    name,
    cardMeta(person, t),
    ...cardExtraInfo(person, t),
    founder ? t("tree.card.founder") : "",
    isClanChief ? t("tree.card.chief") : "",
    directLineage ? t("tree.card.directLineageHint") : t("tree.card.inLawHint"),
    ...badges,
    ...state.errors,
  ].filter(Boolean);
  // Nút chỉ có trong DOM khi thẻ đang rê chuột, đang focus hoặc đang chọn (và không trong lúc kéo).
  const showTools = (active || selected) && !dragging;
  const actions = showTools ? [
    canEdit ? { key: "create", icon: "person_add", label: t("tree.card.addRelation"), onClick: () => onQuickCreate?.(person) } : null,
    hasChildren ? {
      key: "children",
      icon: collapsed ? "expand_more" : "expand_less",
      label: collapsed ? t("tree.card.collapse.expand") : t("tree.card.collapse.collapse"),
      onClick: () => onToggleCollapse?.(person.id),
    } : null,
    hasChildren ? {
      key: "descendants",
      icon: collapsed ? "unfold_more" : "unfold_less",
      label: collapsed ? t("tree.card.descendantsExpand") : t("tree.card.descendantsCollapse"),
      onClick: () => onToggleDescendants?.(person.id),
    } : null,
    hasAncestors ? {
      key: "ancestors",
      icon: ancestorsCollapsed ? "keyboard_double_arrow_down" : "keyboard_double_arrow_up",
      label: ancestorsCollapsed ? t("tree.card.ancestorsExpand") : t("tree.card.ancestorsCollapse"),
      onClick: () => onToggleAncestors?.(person.id),
    } : null,
    canEdit ? { key: "edit", icon: "edit", label: t("tree.card.edit"), onClick: () => onEdit(person) } : null,
    canDelete ? { key: "delete", icon: "delete", label: t("tree.card.delete"), tone: "danger", onClick: () => onDelete(person) } : null,
  ] : [];

  return (
    <div
      id={`fte-person-${person.id}`}
      className={`fte-personCard is-${displayMode} is-${cardOrientation} ${genderClass} ${directLineage ? "is-direct" : "is-inLaw"} ${founder ? "is-founder" : ""} ${deceased ? "is-deceased" : ""} ${stateClasses} ${related ? "is-related" : ""} ${dimmed ? "is-dimmed" : ""} ${dragging ? "is-dragging" : ""}`}
      style={{
        transform: nodeTransform(x, y),
        "--fte-card-width": `${width}px`,
        "--fte-card-height": `${height}px`,
        "--fte-card-name-size": `${resolvedFontSize}px`,
      }}
      role="group"
      tabIndex={0}
      title={tooltipLines.join("\n")}
      aria-label={tooltipLines.join(", ")}
      onPointerDown={(event) => onPointerDown(event, person)}
      data-static={!canDrag}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onEdit(person);
        }
      }}
      {...activeHandlers}
    >
      <CardPersonBody person={person} name={name} meta={meta} showAvatar={detail} />
      {founder || isClanChief ? (
        <span className={`fte-cornerBadge ${founder ? "is-founder" : ""}`}>{founder ? t("tree.card.founder") : t("tree.card.chief")}</span>
      ) : null}
      {state.editing ? <span className="fte-nodeBadge is-editing">{t("tree.card.badges.editing")}</span> : null}
      {state.error ? <span className="fte-nodeBadge is-error">!</span> : null}
      {collapsed && hasChildren ? (
        <button
          type="button"
          className="fte-branchBadge"
          title={t("tree.card.collapse.expand")}
          aria-label={t("tree.card.collapse.expand")}
          onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); }}
          onClick={(event) => { event.stopPropagation(); onToggleCollapse?.(person.id); }}
        >
          +
        </button>
      ) : null}
      {ancestorsCollapsed && hasAncestors ? (
        <button
          type="button"
          className="fte-branchBadge is-ancestors"
          title={t("tree.card.ancestorsExpand")}
          aria-label={t("tree.card.ancestorsExpand")}
          onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); }}
          onClick={(event) => { event.stopPropagation(); onToggleAncestors?.(person.id); }}
        >
          ↑
        </button>
      ) : null}
      <TreeCardToolbar actions={actions} label={t("tree.card.toolbar")} />
      {showTools && canEdit ? (
        <span className="fte-resizeHandle" role="presentation" title={t("tree.card.resize")} onPointerDown={(event) => onResizePointerDown(event, person)} />
      ) : null}
    </div>
  );
}

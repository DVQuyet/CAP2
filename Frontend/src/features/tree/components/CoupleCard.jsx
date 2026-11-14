import { memo } from "react";
import { useLanguage } from "../../../i18n/LanguageContext";
import { fullName } from "../utils/tree-editor/treePersonUtils";
import { WEB_CARD_HEIGHT, WEB_CARD_WIDTH } from "../utils/tree-editor/treeDisplayConfig";
import { useCardActive } from "../hooks/useCardActive";
import { nodeTransform } from "../hooks/useNodeDrag";
import { cardExtraInfo, cardMeta, genderKey } from "../utils/tree-editor/treeCardInfo";
import { CardPersonBody } from "./TreeCardParts";
import TreeCardToolbar from "./TreeCardToolbar";

function PersonHalf({
  person,
  side,
  selected,
  onPath = false,
  directLineage,
  hasChildren,
  descendantCount = 0,
  hasAncestors,
  descendantsCollapsed,
  ancestorsCollapsed,
  onToggleDescendants,
  onToggleAncestors,
  detail = true,
}) {
  const { t } = useLanguage();
  const [active, activeHandlers] = useCardActive();
  const name = person ? fullName(person, t("tree.card.fallbackName")) : t("tree.card.unknownName");
  const deceased = Number(person?.is_living) === 0;
  const tooltipLines = person ? [
    name,
    cardMeta(person, t),
    ...cardExtraInfo(person, t),
    directLineage ? t("tree.card.directLineageHint") : t("tree.card.inLawHint"),
  ].filter(Boolean) : [name];
  // Nút chỉ có trong DOM khi nửa thẻ đang rê chuột, đang focus hoặc đang chọn.
  const actions = person && (active || selected) ? [
    hasChildren ? {
      key: "descendants",
      icon: descendantsCollapsed ? "unfold_more" : "unfold_less",
      label: descendantsCollapsed ? t("tree.card.descendantsExpand") : t("tree.card.descendantsCollapse"),
      onClick: () => onToggleDescendants?.(person.id),
    } : null,
    hasAncestors ? {
      key: "ancestors",
      icon: ancestorsCollapsed ? "keyboard_double_arrow_down" : "keyboard_double_arrow_up",
      label: ancestorsCollapsed ? t("tree.card.ancestorsExpand") : t("tree.card.ancestorsCollapse"),
      onClick: () => onToggleAncestors?.(person.id),
    } : null,
  ] : [];

  return (
    <div
      className={`fte-coupleHalf is-${side} is-${genderKey(person)} ${directLineage ? "is-direct" : "is-inLaw"} ${deceased ? "is-deceased" : ""} ${selected ? "is-selectedPerson" : ""} ${onPath ? "is-onPath" : ""} ${person ? "" : "is-empty"}`}
      data-person-id={person?.id || ""}
      title={tooltipLines.join("\n")}
      {...activeHandlers}
    >
      <CardPersonBody person={person} name={name} meta={person && detail ? cardMeta(person, t) : ""} showAvatar={Boolean(person) && detail} />
      {person && hasChildren && descendantsCollapsed ? (
        <button
          type="button"
          className="fte-branchBadge"
          title={t("tree.card.branchBadge", { count: descendantCount })}
          aria-label={t("tree.card.branchBadge", { count: descendantCount })}
          aria-expanded={false}
          onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); }}
          onClick={(event) => { event.stopPropagation(); onToggleDescendants?.(person.id); }}
        >
          +{descendantCount}
        </button>
      ) : null}
      {person && hasAncestors && ancestorsCollapsed ? (
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
    </div>
  );
}

// React.memo: cha chỉ truyền selectedPersonId khi người đó thuộc cặp này, Set/Map đã memo, hàm ổn định.
export default memo(CoupleCard);

function CoupleCard({
  node,
  selectedPersonId,
  selectedCouple,
  pathPersonIds = null,
  related = false,
  dimmed = false,
  dragging = false,
  canDrag = true,
  directLineagePersonIds,
  lineageControlsByPersonId,
  collapsedIds,
  hiddenAncestorIds,
  cardOrientation = "horizontal",
  displayMode = "detail",
  fontSize,
  onToggleDescendants,
  onToggleAncestors,
  onPointerDown,
}) {
  const detail = displayMode !== "overview";
  const { t } = useLanguage();
  const husbandSelected = Number(selectedPersonId) === Number(node?.husband?.id);
  const wifeSelected = Number(selectedPersonId) === Number(node?.wife?.id);
  const husbandLineage = lineageControlsByPersonId?.get?.(Number(node?.husband?.id));
  const wifeLineage = lineageControlsByPersonId?.get?.(Number(node?.wife?.id));
  const husbandDirect = directLineagePersonIds?.has?.(Number(node?.husband?.id));
  const wifeDirect = directLineagePersonIds?.has?.(Number(node?.wife?.id));
  const halves = [
    {
      key: "husband",
      person: node.husband,
      side: "left",
      selected: husbandSelected,
      onPath: Boolean(pathPersonIds?.has?.(Number(node?.husband?.id))),
      directLineage: husbandDirect,
      lineage: husbandLineage,
      descendantsCollapsed: collapsedIds?.has?.(Number(node?.husband?.id)),
      ancestorsCollapsed: husbandLineage?.ancestorIds?.some((id) => hiddenAncestorIds?.has?.(Number(id))),
    },
    {
      key: "wife",
      person: node.wife,
      side: "right",
      selected: wifeSelected,
      onPath: Boolean(pathPersonIds?.has?.(Number(node?.wife?.id))),
      directLineage: wifeDirect,
      lineage: wifeLineage,
      descendantsCollapsed: collapsedIds?.has?.(Number(node?.wife?.id)),
      ancestorsCollapsed: wifeLineage?.ancestorIds?.some((id) => hiddenAncestorIds?.has?.(Number(id))),
    },
  ];
  const orderedHalves = cardOrientation === "vertical" && wifeDirect && !husbandDirect
    ? [halves[1], halves[0]]
    : halves;
  const status = String(node?.relationshipStatus || "active");
  const unionType = String(node?.unionType || "marriage");
  const statusLabel = status !== "active" && status !== "unknown"
    ? t(`tree.relationOptions.statuses.${status}`)
    : unionType !== "marriage" && unionType !== "unknown"
      ? t(`tree.relationOptions.unionTypes.${unionType}`)
      : "";
  // Đã kết thúc (ly hôn, ly thân...) hoặc không phải hôn nhân chính thức (vợ lẽ...): vẽ nét đứt.
  const looseUnion = Boolean(statusLabel);
  const title = [
    fullName(node?.husband, t("tree.card.fallbackName")),
    fullName(node?.wife, t("tree.card.fallbackName")),
  ].filter(Boolean).join(" - ") + (statusLabel ? ` (${statusLabel})` : "");

  return (
    <div
      id={`fte-display-${node.id}`}
      className={`fte-coupleCard is-${cardOrientation} is-${displayMode} is-union-${status} ${looseUnion ? "is-looseUnion" : ""} ${selectedCouple ? "is-selected" : ""} ${related ? "is-related" : ""} ${dimmed ? "is-dimmed" : ""} ${dragging ? "is-dragging" : ""}`}
      style={{
        transform: nodeTransform(node.x, node.y),
        "--fte-card-width": `${node.width || WEB_CARD_WIDTH}px`,
        "--fte-card-height": `${node.height || WEB_CARD_HEIGHT}px`,
        "--fte-card-name-size": `${Number(fontSize) || 17}px`,
      }}
      title={title}
      data-static={!canDrag}
      onPointerDown={(event) => onPointerDown?.(event, node)}
    >
      <PersonHalf
        person={orderedHalves[0].person}
        side={orderedHalves[0].side}
        selected={orderedHalves[0].selected}
        onPath={orderedHalves[0].onPath}
        directLineage={orderedHalves[0].directLineage}
        hasChildren={orderedHalves[0].lineage?.hasDescendants}
        descendantCount={orderedHalves[0].lineage?.descendantIds?.length}
        hasAncestors={orderedHalves[0].lineage?.hasAncestors}
        descendantsCollapsed={orderedHalves[0].descendantsCollapsed}
        ancestorsCollapsed={orderedHalves[0].ancestorsCollapsed}
        onToggleDescendants={onToggleDescendants}
        onToggleAncestors={onToggleAncestors}
        detail={detail}
      />
      <span className="fte-coupleDivider" aria-hidden="true">
        <span className="fte2-coupleKnot" title={statusLabel || t("tree.card.spouses")} />
        {statusLabel ? <span className="fte-coupleStatus">{statusLabel}</span> : null}
      </span>
      <PersonHalf
        person={orderedHalves[1].person}
        side={orderedHalves[1].side}
        selected={orderedHalves[1].selected}
        onPath={orderedHalves[1].onPath}
        directLineage={orderedHalves[1].directLineage}
        hasChildren={orderedHalves[1].lineage?.hasDescendants}
        descendantCount={orderedHalves[1].lineage?.descendantIds?.length}
        hasAncestors={orderedHalves[1].lineage?.hasAncestors}
        descendantsCollapsed={orderedHalves[1].descendantsCollapsed}
        ancestorsCollapsed={orderedHalves[1].ancestorsCollapsed}
        onToggleDescendants={onToggleDescendants}
        onToggleAncestors={onToggleAncestors}
        detail={detail}
      />
    </div>
  );
}

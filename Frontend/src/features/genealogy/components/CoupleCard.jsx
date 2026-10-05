import { useLanguage } from "../../../i18n/LanguageContext";
import { fullName } from "../utils/tree-editor/treePersonUtils";
import { WEB_CARD_HEIGHT, WEB_CARD_WIDTH } from "../utils/tree-editor/treeDisplayNodes";
import { CardPersonBody, genderKey, lifeYears } from "./TreeCardParts";

function PersonHalf({
  person,
  side,
  selected,
  directLineage,
  hasChildren,
  hasAncestors,
  descendantsCollapsed,
  ancestorsCollapsed,
  onToggleDescendants,
  onToggleAncestors,
  showAvatar = true,
  showMeta = true,
}) {
  const { t } = useLanguage();
  const name = person ? fullName(person, t("tree.card.fallbackName")) : t("tree.card.unknownName");
  const generation = person?.generation ? t("tree.card.generation", { count: person.generation }) : "";
  const childOrder = Number(person?.child_order || person?.child_sort_order);
  const childOrderLabel = Number.isFinite(childOrder) && childOrder > 0 ? t("tree.card.childOrder", { count: childOrder }) : "";
  const meta = [lifeYears(person), generation, childOrderLabel].filter(Boolean).join(" · ");
  const deceased = Number(person?.is_living) === 0;
  const stopActionPointer = (event) => {
    event.preventDefault();
    event.stopPropagation();
  };

  return (
    <div
      className={`fte-coupleHalf is-${side} is-${genderKey(person)} ${directLineage ? "is-direct" : "is-inLaw"} ${deceased ? "is-deceased" : ""} ${selected ? "is-selectedPerson" : ""} ${person ? "" : "is-empty"}`}
      data-person-id={person?.id || ""}
      title={[name, directLineage ? t("tree.card.directLineageHint") : t("tree.card.inLawHint")].join("\n")}
    >
      {person && (hasChildren || hasAncestors) ? (
        <div className="fte-coupleHalfActions">
          {hasChildren ? (
            <button
              type="button"
              title={descendantsCollapsed ? t("tree.card.descendantsExpand") : t("tree.card.descendantsCollapse")}
              onPointerDown={stopActionPointer}
              onClick={(event) => { event.stopPropagation(); onToggleDescendants?.(person.id); }}
            >
              <span className="material-symbols-outlined">{descendantsCollapsed ? "unfold_more" : "unfold_less"}</span>
            </button>
          ) : null}
          {hasAncestors ? (
            <button
              type="button"
              title={ancestorsCollapsed ? t("tree.card.ancestorsExpand") : t("tree.card.ancestorsCollapse")}
              onPointerDown={stopActionPointer}
              onClick={(event) => { event.stopPropagation(); onToggleAncestors?.(person.id); }}
            >
              <span className="material-symbols-outlined">{ancestorsCollapsed ? "keyboard_double_arrow_down" : "keyboard_double_arrow_up"}</span>
            </button>
          ) : null}
        </div>
      ) : null}
      {person ? (
        <CardPersonBody person={person} name={name} meta={showMeta ? meta : ""} showAvatar={showAvatar} directLineage={directLineage} />
      ) : (
        <div className="fte2-cardBody"><div className="fte2-cardText"><div className="fte-cardName">{name}</div></div></div>
      )}
    </div>
  );
}

export default function CoupleCard({
  node,
  selectedPersonId,
  selectedCouple,
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
  const title = [
    fullName(node?.husband, t("tree.card.fallbackName")),
    fullName(node?.wife, t("tree.card.fallbackName")),
  ].filter(Boolean).join(" - ") + (statusLabel ? ` (${statusLabel})` : "");

  return (
    <div
      id={`fte-display-${node.id}`}
      className={`fte-coupleCard is-${cardOrientation} is-${displayMode} is-union-${status} ${selectedCouple ? "is-selected" : ""} ${related ? "is-related" : ""} ${dimmed ? "is-dimmed" : ""} ${dragging ? "is-dragging" : ""}`}
      style={{
        left: node.x,
        top: node.y,
        width: node.width || WEB_CARD_WIDTH,
        height: node.height || WEB_CARD_HEIGHT,
        "--fte-card-width": `${node.width || WEB_CARD_WIDTH}px`,
        "--fte-card-height": `${node.height || WEB_CARD_HEIGHT}px`,
        "--fte-couple-name-size": `${Number(fontSize) || 15}px`,
        "--fte-couple-meta-size": `${Math.max(10, Math.round((Number(fontSize) || 15) * 0.72))}px`,
      }}
      title={title}
      data-static={!canDrag}
      onPointerDown={(event) => onPointerDown?.(event, node)}
    >
      <PersonHalf
        person={orderedHalves[0].person}
        side={orderedHalves[0].side}
        selected={orderedHalves[0].selected}
        directLineage={orderedHalves[0].directLineage}
        hasChildren={orderedHalves[0].lineage?.hasDescendants}
        hasAncestors={orderedHalves[0].lineage?.hasAncestors}
        descendantsCollapsed={orderedHalves[0].descendantsCollapsed}
        ancestorsCollapsed={orderedHalves[0].ancestorsCollapsed}
        onToggleDescendants={onToggleDescendants}
        onToggleAncestors={onToggleAncestors}
        showAvatar={detail}
        showMeta={detail}
      />
      <span className="fte-coupleDivider" aria-hidden="true">
        <span className="fte2-coupleKnot" title={statusLabel || t("tree.card.spouses")} />
        {statusLabel ? <span className="fte-coupleStatus">{statusLabel}</span> : null}
      </span>
      <PersonHalf
        person={orderedHalves[1].person}
        side={orderedHalves[1].side}
        selected={orderedHalves[1].selected}
        directLineage={orderedHalves[1].directLineage}
        hasChildren={orderedHalves[1].lineage?.hasDescendants}
        hasAncestors={orderedHalves[1].lineage?.hasAncestors}
        descendantsCollapsed={orderedHalves[1].descendantsCollapsed}
        ancestorsCollapsed={orderedHalves[1].ancestorsCollapsed}
        onToggleDescendants={onToggleDescendants}
        onToggleAncestors={onToggleAncestors}
        showAvatar={detail}
        showMeta={detail}
      />
    </div>
  );
}

import { useLanguage } from "../../../i18n/LanguageContext";
import { formatDateVN } from "../../../shared/utils/dateFormat";
import { fullName } from "../utils/tree-editor/treePersonUtils";
import { WEB_CARD_HEIGHT, WEB_CARD_WIDTH } from "../utils/tree-editor/treeDisplayNodes";

function lifeMeta(person) {
  const birth = String(person?.birth_date || formatDateVN(person?.birth_date) || "").match(/\d{4}/)?.[0] || "";
  const death = Number(person?.is_living) === 0
    ? String(person?.death_date || formatDateVN(person?.death_date) || "").match(/\d{4}/)?.[0] || ""
    : "";
  if (birth && death) return `${birth} - ${death}`;
  return birth || death || "";
}

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
}) {
  const { t } = useLanguage();
  const name = person ? fullName(person, t("tree.card.fallbackName")) : "Chua ro";
  const meta = lifeMeta(person);
  const generation = person?.generation ? t("tree.card.generation", { count: person.generation }) : "";
  const stopActionPointer = (event) => {
    event.preventDefault();
    event.stopPropagation();
  };

  return (
    <div
      className={`fte-coupleHalf is-${side} ${selected ? "is-selectedPerson" : ""} ${person ? "" : "is-empty"}`}
      data-person-id={person?.id || ""}
      title={name}
    >
      {directLineage ? <span className="fte-directLineageMark" title="Truc he" aria-label="Truc he">◎</span> : null}
      {person && (hasChildren || hasAncestors) ? (
        <div className="fte-coupleHalfActions">
          {hasChildren ? (
            <button
              type="button"
              title={descendantsCollapsed ? "Mo tat ca doi con chau" : "Dong tat ca doi con chau"}
              onPointerDown={stopActionPointer}
              onClick={(event) => { event.stopPropagation(); onToggleDescendants?.(person.id); }}
            >
              <span className="material-symbols-outlined">{descendantsCollapsed ? "unfold_more" : "unfold_less"}</span>
            </button>
          ) : null}
          {hasAncestors ? (
            <button
              type="button"
              title={ancestorsCollapsed ? "Mo tat ca doi to tien" : "Dong tat ca doi to tien"}
              onPointerDown={stopActionPointer}
              onClick={(event) => { event.stopPropagation(); onToggleAncestors?.(person.id); }}
            >
              <span className="material-symbols-outlined">{ancestorsCollapsed ? "keyboard_double_arrow_down" : "keyboard_double_arrow_up"}</span>
            </button>
          ) : null}
        </div>
      ) : null}
      <strong>{name}</strong>
      {meta ? <span>{meta}</span> : null}
      {generation ? <small>{generation}</small> : null}
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
  fontSize,
  onToggleDescendants,
  onToggleAncestors,
  onPointerDown,
}) {
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
  const title = [
    fullName(node?.husband, t("tree.card.fallbackName")),
    fullName(node?.wife, t("tree.card.fallbackName")),
  ].filter(Boolean).join(" - ");

  return (
    <div
      id={`fte-display-${node.id}`}
      className={`fte-coupleCard is-${cardOrientation} ${selectedCouple ? "is-selected" : ""} ${related ? "is-related" : ""} ${dimmed ? "is-dimmed" : ""} ${dragging ? "is-dragging" : ""}`}
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
      />
      <span className="fte-coupleDivider" aria-hidden="true" />
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
      />
    </div>
  );
}

import { memo } from "react";
import { asArray } from "../utils/tree-editor/treePersonUtils";
import { DISPLAY_NODE_TYPE } from "../model/scene/cardMetrics.js";
import { isLineOnPath } from "../utils/treePathHighlight";
import CoupleCard from "./CoupleCard";
import ReferenceCard from "./ReferenceCard";
import TreeNodeCard from "./TreeNodeCard";

const lineDragKey = (line) => `${Number(line.familyId)}:${line.routeKey || "baseY"}`;

function lineClassName(line, { selectedRelatedIds, pathHighlight, canEditAll, draggingLineId }) {
  const lineRelated = !selectedRelatedIds.size || asArray(line.relatedPersonIds).some((id) => selectedRelatedIds.has(Number(id)));
  return [
    "fte-line",
    `is-${line.type}`,
    line.variant ? `is-variant-${line.variant}` : "",
    line.branchLevel === 0 && line.type === "blood" ? "is-mainBranch" : "",
    selectedRelatedIds.size ? (lineRelated ? "is-related" : "is-dimmed") : "",
    isLineOnPath(line, pathHighlight) ? "is-onPath" : "",
    line.dragAxis ? `is-axis-${line.dragAxis}` : "",
    canEditAll && line.dragAxis ? "is-draggable" : "",
    draggingLineId === lineDragKey(line) ? "is-dragging" : "",
  ].filter(Boolean).join(" ");
}

function RouteControlGlyph({ axis }) {
  const arrows = axis === "xy"
    ? "M -7 -7 L -2 -7 M 7 -7 L 2 -7 M -7 7 L -2 7 M 7 7 L 2 7 M -7 -7 L -7 -2 M -7 7 L -7 2 M 7 -7 L 7 -2 M 7 7 L 7 2"
    : axis === "x" ? "M -3 -5 L -8 0 L -3 5 M 3 -5 L 8 0 L 3 5" : "M -5 -3 L 0 -8 L 5 -3 M -5 3 L 0 8 L 5 3";
  return (
    <>
      {axis === "xy" || axis === "x" ? <line x1="0" y1="-28" x2="0" y2="28" /> : null}
      {axis === "xy" || axis !== "x" ? <line x1="-28" y1="0" x2="28" y2="0" /> : null}
      <circle cx="0" cy="0" r="12" />
      <path d={arrows} />
    </>
  );
}

// Lớp đường nối (SVG). memo: chỉ vẽ lại khi danh sách đường đang thấy, chọn/đường dẫn hoặc đường đang kéo đổi.
export const TreeLinesLayer = memo(function TreeLinesLayer({
  width,
  height,
  lines,
  selectedRelatedIds,
  pathHighlight,
  draggingLineId,
  canEditAll,
  onLinePointerDown,
}) {
  const classContext = { selectedRelatedIds, pathHighlight, canEditAll, draggingLineId };
  return (
    <svg className="fte-lines" width={width} height={height} aria-hidden={false}>
      {lines.filter((line) => line.type !== "route-control").map((line, index) => (
        <path
          key={line.id || `${line.type}-${index}`}
          className={lineClassName(line, classContext)}
          d={line.d}
          style={line.color ? { "--line-color": line.color } : undefined}
          onPointerDown={canEditAll && line.dragAxis ? (event) => onLinePointerDown(event, line) : undefined}
        />
      ))}
      {canEditAll ? lines.filter((line) => line.type === "route-control").map((line) => (
        <g
          key={line.id}
          className={`fte-lineControl ${line.dragAxis ? `is-axis-${line.dragAxis}` : ""} ${draggingLineId === lineDragKey(line) ? "is-dragging" : ""}`}
          transform={`translate(${line.x}, ${line.y})`}
          onPointerDown={(event) => onLinePointerDown(event, line)}
        >
          <RouteControlGlyph axis={line.dragAxis} />
        </g>
      )) : null}
    </svg>
  );
});

function renderCoupleCard(node, ctx, related, dimmed) {
  const activePersonId = ctx.selectedType === "person" ? (ctx.selectedId ?? ctx.focusedPersonId) : null;
  const ownsSelection = activePersonId != null && asArray(node.personIds).some((id) => Number(id) === Number(activePersonId));
  return (
    <CoupleCard
      key={node.id}
      node={node}
      selectedPersonId={ownsSelection ? activePersonId : null}
      selectedCouple={(ctx.selectedType === "couple" && ctx.selectedCoupleId === node.id) || ctx.selectedDisplayNodeIds.has(node.id)}
      pathPersonIds={ctx.pathPersonIds}
      related={related}
      dimmed={dimmed}
      dragging={ctx.draggingId === node.id}
      canDrag={node.personIds.some((personId) => ctx.canEditPerson(personId))}
      directLineagePersonIds={ctx.bloodLinePersonIds}
      lineageControlsByPersonId={ctx.lineageControlsByPersonId}
      collapsedIds={ctx.collapsedIds}
      hiddenAncestorIds={ctx.hiddenAncestorIds}
      cardOrientation={ctx.cardOrientation}
      displayMode={ctx.displayMode}
      fontSize={ctx.fontSize}
      onToggleDescendants={ctx.onToggleDescendants}
      onToggleAncestors={ctx.onToggleAncestors}
      onPointerDown={ctx.onCouplePointerDown}
    />
  );
}

function renderPersonCard(node, ctx, related, dimmed) {
  const person = node.person;
  const personId = Number(person.id);
  const lineage = ctx.lineageControlsByPersonId.get(personId);
  const editable = ctx.canEditPerson(person.id);
  const selectedPerson = ctx.selectedType === "person"
    && (ctx.selectedId === person.id || (ctx.selectedId == null && ctx.focusedPersonId === person.id));
  return (
    <TreeNodeCard
      key={node.id}
      person={person}
      x={node.x}
      y={node.y}
      width={node.width}
      height={node.height}
      selected={selectedPerson || ctx.selectedDisplayNodeIds.has(node.id)}
      dragging={ctx.draggingId === person.id}
      canDrag={editable}
      canEdit={editable}
      canDelete={ctx.canEditAll && editable}
      founder={ctx.founderIds.has(personId)}
      directLineage={ctx.bloodLinePersonIds.has(personId)}
      displayMode={ctx.displayMode}
      cardOrientation={ctx.cardOrientation}
      fontSize={ctx.fontSize}
      related={related}
      dimmed={dimmed}
      hasChildren={(ctx.childCountByParentId.get(personId) || 0) > 0}
      hasAncestors={lineage?.hasAncestors}
      collapsed={ctx.collapsedIds.has(personId)}
      ancestorsCollapsed={lineage?.ancestorIds?.some((id) => ctx.hiddenAncestorIds.has(Number(id)))}
      highlightOptions={ctx.highlightOptions}
      onPointerDown={ctx.onCardPointerDown}
      onResizePointerDown={ctx.onCardResizePointerDown}
      onEdit={ctx.onEditPerson}
      onDelete={ctx.onDeletePerson}
      onQuickCreate={ctx.onQuickCreate}
      onToggleCollapse={ctx.onToggleCollapse}
      onToggleDescendants={ctx.onToggleDescendants}
      onToggleAncestors={ctx.onToggleAncestors}
    />
  );
}

// Lớp thẻ: chỉ nhận các nút trong cửa sổ vẽ. Mỗi thẻ là React.memo nên lớp này render lại rất rẻ;
// thẻ nào có prop không đổi thì React bỏ qua.
export function TreeNodesLayer({ nodes, ctx }) {
  const { selectedRelatedIds } = ctx;
  return nodes.map((node) => {
    if (node.type === DISPLAY_NODE_TYPE.REFERENCE) {
      const referenceRelated = selectedRelatedIds.has(Number(node.refPersonId));
      return (
        <ReferenceCard
          key={node.id}
          node={node}
          related={referenceRelated}
          dimmed={selectedRelatedIds.size > 0 && !referenceRelated}
          onOpen={ctx.onOpenReference}
        />
      );
    }
    const related = asArray(node.personIds).some((personId) => selectedRelatedIds.has(Number(personId)));
    const dimmed = selectedRelatedIds.size > 0 && !related;
    if (node.type === DISPLAY_NODE_TYPE.COUPLE) return renderCoupleCard(node, ctx, related, dimmed);
    return renderPersonCard(node, ctx, related, dimmed);
  });
}

// Từ vị trí từng người dựng "cây hiển thị": thẻ, điểm nối hôn nhân, thẻ tham chiếu.
// Dùng chung cho màn hình và xuất ảnh (xuất ảnh có thêm bước xếp lại theo hàng).
import { CANVAS_PADDING, GENERATION_GAP, SIBLING_GAP } from "../config.js";
import { asArray, bottomY, centerX, toInt } from "../geometry.js";
import { personSort } from "../personOrder.js";
import { buildUnionAnchors } from "./anchors.js";
import { DISPLAY_NODE_TYPE, cardMetrics, nodeSize, normalizeCardOrientation, rowSpacing } from "./cardMetrics.js";
import { buildCardNodes, buildTreeGraph, generationOf } from "./nodes.js";

// Thẻ tham chiếu cho các liên kết cha mẹ - con không phải vị trí chính của người đó.
// Thêm thẻ vào `nodes`, trả Map "familyId:personId" -> thẻ.
function addReferenceNodes(graph, nodes, unionAnchors, view, referencePlacements) {
  const placements = new Map(asArray(referencePlacements).map((item) => [`${item.familyId}:${item.personId}`, item]));
  const size = nodeSize(DISPLAY_NODE_TYPE.SINGLE, view.exportMode, view.cardOrientation);
  const referenceNodes = new Map();
  graph.model.linksByFamily.forEach((links, familyId) => {
    const anchor = unionAnchors.get(Number(familyId));
    if (!anchor) return;
    let fallbackIndex = 0;
    links.forEach((link) => {
      if (graph.model.isHomeLink(link.familyId, link.personId)) return;
      const person = graph.peopleById.get(Number(link.personId));
      if (!person) return;
      const key = `${link.familyId}:${link.personId}`;
      const placement = placements.get(key);
      // Chưa có vị trí tính sẵn: xếp lần lượt quanh điểm nối, cách một đời.
      const dx = placement ? toInt(placement.dx, 0) : (fallbackIndex - 0.5) * (size.width + SIBLING_GAP);
      const dy = placement ? toInt(placement.dy, GENERATION_GAP) : GENERATION_GAP;
      fallbackIndex += 1;
      const node = {
        id: `ref_${link.familyId}_${link.personId}`,
        type: DISPLAY_NODE_TYPE.REFERENCE,
        person,
        familyId: Number(link.familyId),
        refPersonId: Number(link.personId),
        childType: link.childType,
        generation: generationOf(person),
        x: Math.round(centerX(anchor) + dx - size.width / 2),
        y: Math.round(bottomY(anchor) + dy),
        width: size.width,
        height: size.height,
        cardOrientation: view.cardOrientation,
        personIds: [],
        children: [],
      };
      nodes.push(node);
      referenceNodes.set(key, node);
    });
  });
  return referenceNodes;
}

const rowWidthOf = (row, gap) => row.reduce((sum, node) => sum + node.width, 0) + Math.max(0, row.length - 1) * gap;

// Xếp lại thẻ thành từng hàng đời căn giữa (xuất ảnh), rồi tính lại điểm nối theo vị trí mới.
function packRows(tree, spacing) {
  const grouped = new Map();
  tree.nodes.forEach((node) => {
    const generation = node.generation || 1;
    if (!grouped.has(generation)) grouped.set(generation, []);
    grouped.get(generation).push(node);
  });
  const generations = [...grouped.keys()].sort((a, b) => a - b);
  const maxRowWidth = Math.max(1, ...generations.map((generation) => rowWidthOf(grouped.get(generation), spacing.siblingGap)));

  const packed = { nodes: [], nodeByPersonId: new Map(), nodeByFamilyId: new Map(), referenceNodes: new Map(), unionModel: tree.unionModel };
  generations.forEach((generation) => {
    const row = grouped.get(generation)
      .slice()
      .sort((a, b) => a.x - b.x || a.y - b.y || personSort(a.husband || a.person || {}, b.husband || b.person || {}));
    let cursorX = CANVAS_PADDING + Math.max(0, (maxRowWidth - rowWidthOf(row, spacing.siblingGap)) / 2);
    const y = CANVAS_PADDING + Math.max(0, generation - 1) * (spacing.cardHeight + spacing.generationGap);
    row.forEach((node) => {
      const moved = { ...node, x: Math.round(cursorX), y: Math.round(y) };
      packed.nodes.push(moved);
      moved.personIds.forEach((personId) => packed.nodeByPersonId.set(Number(personId), moved));
      if (moved.type === DISPLAY_NODE_TYPE.COUPLE && moved.familyId) packed.nodeByFamilyId.set(Number(moved.familyId), moved);
      if (moved.type === DISPLAY_NODE_TYPE.REFERENCE) packed.referenceNodes.set(`${moved.familyId}:${moved.refPersonId}`, moved);
      cursorX += node.width + spacing.siblingGap;
    });
  });
  return { ...packed, ...buildUnionAnchors({ ...packed, model: tree.unionModel }, { packed: true }) };
}

// options: cardOrientation, referencePlacements (từ layoutTree), lineage, exportMode, exportModeName, packRows.
// Trả { nodes, nodeByPersonId, nodeByFamilyId, unionAnchors, unionConnectors, referenceNodes, unionModel }.
export function buildDisplayTree(people = [], families = [], childRows = [], options = {}) {
  const exportMode = Boolean(options.exportMode);
  const cardOrientation = normalizeCardOrientation(options.cardOrientation);
  const view = { exportMode, cardOrientation, metrics: cardMetrics(exportMode, cardOrientation) };
  const graph = buildTreeGraph(people, families, childRows, options);

  const cards = buildCardNodes(graph, view);
  const { unionAnchors, unionConnectors } = buildUnionAnchors({ ...cards, model: graph.model });
  const referenceNodes = addReferenceNodes(graph, cards.nodes, unionAnchors, view, options.referencePlacements);
  const tree = { ...cards, unionAnchors, unionConnectors, referenceNodes, unionModel: graph.model };

  if (options.packRows) return packRows(tree, rowSpacing(options));
  return { ...tree, nodes: cards.nodes.slice().sort((a, b) => a.y - b.y || a.x - b.x) };
}

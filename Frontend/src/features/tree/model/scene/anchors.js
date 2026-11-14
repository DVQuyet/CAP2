// Điểm nối của từng gia đình: nơi đường con cái xuất phát, và đường nối hôn nhân giữa hai thẻ riêng.
import { UNION_CONNECTOR_DROP, UNION_CONNECTOR_STEP } from "../config.js";
import { bottomY, centerX, centerY, leftX, rightX, topY } from "../geometry.js";
import { isEndedUnion } from "../unions.js";
import { DISPLAY_NODE_TYPE, isVerticalCard } from "./cardMetrics.js";

// Nửa thẻ đôi (ngang) thuộc về một người: cha/mẹ đơn thân trong thẻ đôi nối con từ nửa của mình.
function personSlot(node, personId) {
  if (node.type !== DISPLAY_NODE_TYPE.COUPLE || isVerticalCard(node.cardOrientation)) return node;
  const isHusband = Number(node.husband?.id) === Number(personId);
  const half = node.width / 2;
  return { ...node, id: `${node.id}_${isHusband ? "h" : "w"}`, x: node.x + (isHusband ? 0 : half), width: half };
}

function parentNodesOf(family, nodeByPersonId) {
  return [family.father_id, family.mother_id]
    .map((id) => (id ? { personId: Number(id), node: nodeByPersonId.get(Number(id)) } : null))
    .filter((item) => item?.node);
}

// Hai thẻ cùng hàng và không có thẻ nào chen giữa.
function standSideBySide(first, second, nodes) {
  if (Math.abs(centerY(first) - centerY(second)) >= first.height / 2) return false;
  return !nodes.some((node) => node !== first && node !== second
    && Math.abs(topY(node) - topY(first)) < first.height / 2
    && leftX(node) >= rightX(first) - 1 && rightX(node) <= leftX(second) + 1);
}

// Đường nối ngang giữa hai thẻ đứng cạnh nhau; con cái thả xuống từ giữa đường nối.
function besideUnion(familyId, first, second, personIds) {
  const y = Math.round((centerY(first) + centerY(second)) / 2);
  const top = Math.min(topY(first), topY(second));
  return {
    d: `M ${Math.round(rightX(first))} ${y} L ${Math.round(leftX(second))} ${y}`,
    anchor: {
      id: `union_${familyId}`,
      x: (rightX(first) + leftX(second)) / 2 - 1,
      y: top,
      width: 2,
      height: Math.max(bottomY(first), bottomY(second)) - top,
      personIds,
    },
  };
}

// Hai thẻ không đứng cạnh nhau (vợ/chồng thứ ba trở đi...): đường nối đi vòng phía dưới thẻ.
function belowUnion(familyId, first, second, personIds, depthIndex) {
  const lineY = Math.round(Math.max(bottomY(first), bottomY(second)) + UNION_CONNECTOR_DROP + depthIndex * UNION_CONNECTOR_STEP);
  const x1 = Math.round(centerX(first));
  const x2 = Math.round(centerX(second));
  return {
    d: `M ${x1} ${Math.round(bottomY(first))} L ${x1} ${lineY} L ${x2} ${lineY} L ${x2} ${Math.round(bottomY(second))}`,
    anchor: { id: `union_${familyId}`, x: Math.round((x1 + x2) / 2) - 1, y: lineY - 2, width: 2, height: 2, personIds },
  };
}

// `packed`: thẻ đã được xếp lại theo hàng (xuất ảnh); khi đó mọi đường nối hôn nhân đều đi vòng phía dưới.
export function buildUnionAnchors({ nodes, nodeByPersonId, nodeByFamilyId, model }, { packed = false } = {}) {
  const unionAnchors = new Map();
  const unionConnectors = [];
  const depthByNode = new Map();
  const nextDepth = (first, second) => {
    const depth = depthByNode.get(first.id) || 0;
    depthByNode.set(first.id, depth + 1);
    depthByNode.set(second.id, (depthByNode.get(second.id) || 0) + 1);
    return depth;
  };

  model.familiesById.forEach((family) => {
    const familyId = Number(family.id);
    const coupleNode = nodeByFamilyId.get(familyId);
    if (coupleNode) {
      unionAnchors.set(familyId, coupleNode);
      return;
    }
    const parents = parentNodesOf(family, nodeByPersonId);
    if (!parents.length) return;
    if (parents.length === 1 || parents[0].node === parents[1].node) {
      const rect = packed ? parents[0].node : personSlot(parents[0].node, parents[0].personId);
      unionAnchors.set(familyId, { ...rect, personIds: [parents[0].personId] });
      return;
    }
    const [first, second] = parents.map((item) => item.node).sort((a, b) => leftX(a) - leftX(b));
    const personIds = parents.map((item) => item.personId);
    const beside = !packed && standSideBySide(first, second, nodes);
    const union = beside
      ? besideUnion(familyId, first, second, personIds)
      : belowUnion(familyId, first, second, personIds, packed ? 0 : nextDepth(first, second));
    unionConnectors.push({
      familyId,
      personIds,
      ended: isEndedUnion(family),
      concubine: String(family.union_type || "") === "concubine",
      ...(beside || packed ? {} : { key: `${first.id}:${second.id}` }),
      d: union.d,
    });
    unionAnchors.set(familyId, union.anchor);
  });
  return { unionAnchors, unionConnectors };
}

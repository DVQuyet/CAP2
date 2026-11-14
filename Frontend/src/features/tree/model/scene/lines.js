// Đường nối của cây: đường hôn nhân giữa các thẻ riêng và đường từ cha mẹ xuống con.
// Mỗi phần tử là một đường vẽ ({ d, ... }) hoặc một tay nắm chỉnh đường (type "route-control", có x, y thay cho d).
import { CHILD_LINE_COLOR } from "../config.js";
import { asArray, averageOf, bottomY, centerX, centerY, leftX, rightX, roundedElbow, topY } from "../geometry.js";
import { isAdoptiveChildType, isStepChildType } from "../unions.js";
import { boundedRoute, resolveParentAnchor, resolveRouteAxis } from "./routes.js";

const numericIds = (ids) => ids.map(Number).filter(Number.isFinite);

// Gom thông tin một gia đình cần để vẽ; null nếu không có gì để vẽ.
function familyRouteContext(family, displayTree, childRows, lineRoutes) {
  const familyId = Number(family.id);
  // Đường con cái xuất phát từ đúng cuộc hôn nhân (hoặc đúng người cha/mẹ khi khuyết người kia).
  const parentNode = displayTree.unionAnchors.get(familyId)
    || displayTree.nodeByFamilyId.get(familyId)
    || displayTree.nodeByPersonId.get(Number(family.father_id))
    || displayTree.nodeByPersonId.get(Number(family.mother_id));
  if (!parentNode) return null;

  const childNodes = [];
  const variantByNodeId = new Map();
  asArray(childRows).forEach((row) => {
    const childNode = displayTree.referenceNodes.get(`${familyId}:${Number(row.person_id)}`) || displayTree.nodeByPersonId.get(Number(row.person_id));
    if (!childNode || childNode.id === parentNode.id || childNodes.includes(childNode)) return;
    if (asArray(parentNode.personIds).some((id) => asArray(childNode.personIds).includes(id))) return;
    childNodes.push(childNode);
    const variant = isAdoptiveChildType(row.child_type) ? "adoptive" : isStepChildType(row.child_type) ? "step" : null;
    if (variant) variantByNodeId.set(childNode.id, variant);
  });
  if (!childNodes.length) return null;
  childNodes.sort((a, b) => centerX(a) - centerX(b) || topY(a) - topY(b));

  return {
    familyId,
    parentNode,
    childNodes,
    variantByNodeId,
    route: lineRoutes?.[familyId] || {},
    relatedPersonIds: numericIds([...parentNode.personIds, ...childNodes.flatMap((node) => node.personIds)]),
  };
}

// Bộ ghi đường của một gia đình: `edge` là đường vẽ, `control` là tay nắm (bỏ qua khi không cần).
function familyWriter(lines, ctx, withControls) {
  const prefix = `display-family-${ctx.familyId}`;
  return {
    edge(name, fields) {
      const id = `${prefix}-${name}`;
      lines.push({ id, edgeId: id, familyId: ctx.familyId, type: "blood", color: CHILD_LINE_COLOR, relatedPersonIds: ctx.relatedPersonIds, ...fields });
    },
    control(name, fields) {
      if (withControls) lines.push({ id: `${prefix}-${name}`, familyId: ctx.familyId, type: "route-control", ...fields });
    },
    childFields(childNode) {
      return {
        relatedPersonIds: numericIds([...ctx.parentNode.personIds, ...childNode.personIds]),
        variant: ctx.variantByNodeId.get(childNode.id) || null,
      };
    },
  };
}

function parentAnchorControl(write, parentNode, parentAnchor) {
  write.control("parent-anchor-control", {
    routeKey: "parentAnchor",
    routeKeyX: "parentAnchorX",
    routeKeyY: "parentAnchorY",
    dragAxis: "xy",
    x: parentAnchor.x,
    y: parentAnchor.y,
    minX: leftX(parentNode),
    maxX: rightX(parentNode),
    minY: topY(parentNode),
    maxY: bottomY(parentNode),
  });
}

// Con nằm dưới cha mẹ: thân đi xuống tới thanh ngang, từ thanh ngang rẽ xuống từng con.
function routeHorizontal(ctx, write) {
  const { parentNode, childNodes, route } = ctx;
  const parentBottom = bottomY(parentNode);
  const childXs = childNodes.map(centerX);
  const minChildTop = Math.min(...childNodes.map(topY));
  const parentAnchor = resolveParentAnchor(route, parentNode, { x: centerX(parentNode), y: parentBottom });
  const minBusY = parentBottom + 30;
  const maxBusY = Math.max(minBusY, minChildTop - 28);
  const naturalBusY = Math.round(parentBottom + Math.max(34, (minChildTop - parentBottom) * 0.46));
  const busY = boundedRoute(route, "baseY", "childJoinY", naturalBusY, minBusY, maxBusY);
  const childLeft = Math.min(...childXs);
  const childRight = Math.max(...childXs);
  const reach = Math.max(110, parentNode.width * 0.45);
  const minTrunkX = Math.min(parentAnchor.x, childLeft) - reach;
  const maxTrunkX = Math.max(parentAnchor.x, childRight) + reach;
  // Một người con lệch tâm ít (do làm tròn theo lưới): kẻ thẳng xuống thay vì gấp khúc.
  const straightDown = childNodes.length === 1 && Math.abs(childXs[0] - parentAnchor.x) <= 24;
  const trunkX = boundedRoute(route, "trunkX", "parentBranchX", straightDown ? childXs[0] : parentAnchor.x, minTrunkX, maxTrunkX);
  const branches = childNodes.map((childNode, index) => {
    const routeKey = `childX:${childNode.id}`;
    const minX = Math.min(trunkX, childXs[index], childLeft) - 120;
    const maxX = Math.max(trunkX, childXs[index], childRight) + 120;
    return { childNode, routeKey, minX, maxX, x: boundedRoute(route, routeKey, null, childXs[index], minX, maxX) };
  });
  const busLeft = Math.min(trunkX, ...branches.map((branch) => branch.x));
  const busRight = Math.max(trunkX, ...branches.map((branch) => branch.x));
  const trunk = { routeKey: "trunkX", dragAxis: "x", x: trunkX, y: Math.round((parentBottom + busY) / 2), minX: minTrunkX, maxX: maxTrunkX };
  const bus = { routeKey: "baseY", dragAxis: "y", x: Math.round((busLeft + busRight) / 2), y: busY, minY: minBusY, maxY: maxBusY };

  write.edge("parent", { ...trunk, d: roundedElbow([parentAnchor, { x: trunkX, y: parentAnchor.y }, { x: trunkX, y: busY }]) });
  parentAnchorControl(write, parentNode, parentAnchor);
  write.edge("bus", { ...bus, d: `M ${Math.round(busLeft)} ${busY} L ${Math.round(busRight)} ${busY}` });
  write.control("trunk-control", trunk);
  write.control("base-control", bus);
  branches.forEach(({ childNode, routeKey, minX, maxX, x }) => {
    const top = topY(childNode);
    const handle = { routeKey, dragAxis: "x", x, y: Math.round((busY + top) / 2), minX, maxX };
    write.edge(`child-${childNode.id}`, {
      ...handle,
      ...write.childFields(childNode),
      d: roundedElbow([{ x, y: busY }, { x, y: top }, { x: centerX(childNode), y: top }]),
    });
    write.control(`child-control-${childNode.id}`, handle);
  });
}

// Con xếp theo chiều dọc: một trục dọc bên cạnh, cha mẹ và từng con nối ngang vào trục.
function routeVertical(ctx, write) {
  const { parentNode, childNodes, route } = ctx;
  const parentMiddleX = centerX(parentNode);
  const childSideYs = childNodes.map(centerY);
  const childLeft = Math.min(...childNodes.map(leftX));
  const childRight = Math.max(...childNodes.map(rightX));
  const naturalBaseX = parentMiddleX > averageOf(childNodes.map(centerX)) ? childRight + 34 : childLeft - 34;
  const reach = Math.max(120, parentNode.width * 0.35);
  const minBaseX = Math.min(leftX(parentNode), childLeft, parentMiddleX) - reach;
  const maxBaseX = Math.max(rightX(parentNode), childRight, parentMiddleX) + reach;
  const baseX = boundedRoute(route, "baseX", "directX", naturalBaseX, minBaseX, maxBaseX);
  const parentSideX = baseX <= parentMiddleX ? leftX(parentNode) : rightX(parentNode);
  const parentAnchor = resolveParentAnchor(route, parentNode, { x: parentSideX, y: centerY(parentNode) });
  const parentMinY = Math.min(parentAnchor.y, ...childSideYs) - 120;
  const parentMaxY = Math.max(parentAnchor.y, ...childSideYs) + 120;
  const parentBranchY = boundedRoute(route, "parentBranchY", "trunkY", parentAnchor.y, parentMinY, parentMaxY);
  const branches = childNodes.map((childNode, index) => {
    const routeKey = `childY:${childNode.id}`;
    const minY = Math.min(parentBranchY, childSideYs[index]) - 120;
    const maxY = Math.max(parentBranchY, childSideYs[index]) + 120;
    return { childNode, routeKey, minY, maxY, sideY: childSideYs[index], y: boundedRoute(route, routeKey, null, childSideYs[index], minY, maxY) };
  });
  const axisMinY = Math.min(parentBranchY, ...branches.map((branch) => branch.y));
  const axisMaxY = Math.max(parentBranchY, ...branches.map((branch) => branch.y));
  const axis = { routeKey: "baseX", dragAxis: "x", x: baseX, y: Math.round((axisMinY + axisMaxY) / 2), minX: minBaseX, maxX: maxBaseX };
  const parentBranch = { routeKey: "parentBranchY", dragAxis: "y", x: Math.round((parentAnchor.x + baseX) / 2), y: parentBranchY, minY: parentMinY, maxY: parentMaxY };

  write.edge("axis", { ...axis, d: roundedElbow([{ x: baseX, y: axisMinY }, { x: baseX, y: axisMaxY }]) });
  write.edge("parent", { ...parentBranch, d: roundedElbow([parentAnchor, { x: parentAnchor.x, y: parentBranchY }, { x: baseX, y: parentBranchY }]) });
  parentAnchorControl(write, parentNode, parentAnchor);
  write.control("axis-control", axis);
  write.control("parent-branch-control", parentBranch);
  branches.forEach(({ childNode, routeKey, minY, maxY, sideY, y }) => {
    const childSideX = baseX <= centerX(childNode) ? leftX(childNode) : rightX(childNode);
    const handle = { routeKey, dragAxis: "y", x: Math.round((baseX + childSideX) / 2), y, minY, maxY };
    write.edge(`child-${childNode.id}`, {
      ...handle,
      ...write.childFields(childNode),
      d: roundedElbow([{ x: baseX, y }, { x: childSideX, y }, { x: childSideX, y: sideY }]),
    });
    write.control(`child-control-${childNode.id}`, handle);
  });
}

// Đường nối hôn nhân giữa các thẻ riêng (người có nhiều vợ/chồng). Nét đứt: đã ly hôn/ly thân; chấm: vợ lẽ.
function unionLine(connector) {
  const id = `display-union-${connector.familyId}`;
  return {
    id,
    edgeId: id,
    familyId: connector.familyId,
    type: "spouse",
    variant: connector.ended ? "ended" : connector.concubine ? "concubine" : null,
    relatedPersonIds: connector.personIds,
    d: connector.d,
  };
}

// options.controls = false: bỏ tay nắm chỉnh đường (người xem không có quyền sửa, xuất ảnh).
export function buildDisplayTreeLines(displayTree, families = [], childRows = [], lineRoutes = {}, options = {}) {
  const withControls = options.controls !== false;
  const childRowsByFamily = new Map();
  asArray(childRows).forEach((row) => {
    const familyId = Number(row.family_id);
    if (!childRowsByFamily.has(familyId)) childRowsByFamily.set(familyId, []);
    childRowsByFamily.get(familyId).push(row);
  });

  const lines = asArray(displayTree?.unionConnectors).map(unionLine);
  if (!displayTree?.unionAnchors) return lines;
  asArray(families).forEach((family) => {
    const ctx = familyRouteContext(family, displayTree, childRowsByFamily.get(Number(family.id)), lineRoutes);
    if (!ctx) return;
    const write = familyWriter(lines, ctx, withControls);
    if (resolveRouteAxis(ctx.route, ctx.parentNode, ctx.childNodes) === "vertical") routeVertical(ctx, write);
    else routeHorizontal(ctx, write);
  });
  return lines;
}

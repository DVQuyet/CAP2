import { CANVAS_PADDING, CHILD_LINE_COLOR, GENERATION_GAP, SIBLING_GAP } from "./treeConstants";
import {
  TREE_CARD_ORIENTATION,
  WEB_CARD_HEIGHT,
  WEB_CARD_WIDTH,
  WEB_PERSON_SLOT_HEIGHT,
  WEB_PERSON_SLOT_WIDTH,
  WEB_VERTICAL_CARD_HEIGHT,
  WEB_VERTICAL_CARD_WIDTH,
  WEB_VERTICAL_PERSON_SLOT_HEIGHT,
  WEB_VERTICAL_PERSON_SLOT_WIDTH,
} from "./treeDisplayConfig";
import {
  EXPORT_CARD_HEIGHT,
  EXPORT_CARD_WIDTH,
  EXPORT_PERSON_SLOT_HEIGHT,
  EXPORT_PERSON_SLOT_WIDTH,
  EXPORT_VERTICAL_CARD_HEIGHT,
  EXPORT_VERTICAL_CARD_WIDTH,
  EXPORT_VERTICAL_PERSON_SLOT_HEIGHT,
  EXPORT_VERTICAL_PERSON_SLOT_WIDTH,
  TREE_EXPORT_DETAIL_CONFIG,
  TREE_EXPORT_MODE,
  TREE_EXPORT_OVERVIEW_CONFIG,
} from "./treeExportConfig";
import { asArray, clamp, personSort, siblingSort, snapLine, toInt } from "./treePersonUtils";

export const DISPLAY_NODE_TYPE = {
  SINGLE: "single",
  COUPLE: "couple",
};

export {
  WEB_CARD_HEIGHT,
  WEB_CARD_WIDTH,
  WEB_PERSON_SLOT_HEIGHT,
  WEB_PERSON_SLOT_WIDTH,
  WEB_VERTICAL_CARD_HEIGHT,
  WEB_VERTICAL_CARD_WIDTH,
  WEB_VERTICAL_PERSON_SLOT_HEIGHT,
  WEB_VERTICAL_PERSON_SLOT_WIDTH,
  EXPORT_CARD_HEIGHT,
  EXPORT_CARD_WIDTH,
  EXPORT_PERSON_SLOT_HEIGHT,
  EXPORT_PERSON_SLOT_WIDTH,
  EXPORT_VERTICAL_CARD_HEIGHT,
  EXPORT_VERTICAL_CARD_WIDTH,
  EXPORT_VERTICAL_PERSON_SLOT_HEIGHT,
  EXPORT_VERTICAL_PERSON_SLOT_WIDTH,
};

export const SINGLE_CARD_WIDTH = WEB_CARD_WIDTH;
export const SINGLE_CARD_HEIGHT = WEB_CARD_HEIGHT;
export const COUPLE_CARD_WIDTH = WEB_CARD_WIDTH;
export const COUPLE_CARD_HEIGHT = WEB_CARD_HEIGHT;

export const EXPORT_SINGLE_CARD_WIDTH = EXPORT_CARD_WIDTH;
export const EXPORT_SINGLE_CARD_HEIGHT = EXPORT_CARD_HEIGHT;
export const EXPORT_COUPLE_CARD_WIDTH = EXPORT_CARD_WIDTH;
export const EXPORT_COUPLE_CARD_HEIGHT = EXPORT_CARD_HEIGHT;

function normalizeCardOrientation(value) {
  return value === TREE_CARD_ORIENTATION.VERTICAL
    ? TREE_CARD_ORIENTATION.VERTICAL
    : TREE_CARD_ORIENTATION.HORIZONTAL;
}

function cardMetrics(exportMode = false, cardOrientation = TREE_CARD_ORIENTATION.HORIZONTAL) {
  const orientation = normalizeCardOrientation(cardOrientation);
  if (orientation === TREE_CARD_ORIENTATION.VERTICAL) {
    return {
      width: exportMode ? EXPORT_VERTICAL_CARD_WIDTH : WEB_VERTICAL_CARD_WIDTH,
      height: exportMode ? EXPORT_VERTICAL_CARD_HEIGHT : WEB_VERTICAL_CARD_HEIGHT,
      personSlotWidth: exportMode ? EXPORT_VERTICAL_PERSON_SLOT_WIDTH : WEB_VERTICAL_PERSON_SLOT_WIDTH,
      personSlotHeight: exportMode ? EXPORT_VERTICAL_PERSON_SLOT_HEIGHT : WEB_VERTICAL_PERSON_SLOT_HEIGHT,
    };
  }
  return {
    width: exportMode ? EXPORT_CARD_WIDTH : WEB_CARD_WIDTH,
    height: exportMode ? EXPORT_CARD_HEIGHT : WEB_CARD_HEIGHT,
    personSlotWidth: exportMode ? EXPORT_PERSON_SLOT_WIDTH : WEB_PERSON_SLOT_WIDTH,
    personSlotHeight: exportMode ? EXPORT_PERSON_SLOT_HEIGHT : WEB_PERSON_SLOT_HEIGHT,
  };
}

function nodeSize(_type, exportMode = false, cardOrientation = TREE_CARD_ORIENTATION.HORIZONTAL) {
  const metrics = cardMetrics(exportMode, cardOrientation);
  return {
    width: metrics.width,
    height: metrics.height,
  };
}

function layoutConfig(options = {}) {
  const metrics = cardMetrics(Boolean(options.exportMode), options.cardOrientation);
  if (!options.exportMode) {
    return {
      cardHeight: metrics.height,
      siblingGap: SIBLING_GAP,
      generationGap: GENERATION_GAP,
    };
  }
  const mode = options.exportModeName || options.mode;
  const config = mode === TREE_EXPORT_MODE.OVERVIEW ? TREE_EXPORT_OVERVIEW_CONFIG : TREE_EXPORT_DETAIL_CONFIG;
  return {
    cardHeight: metrics.height || config.cardHeight || EXPORT_CARD_HEIGHT,
    siblingGap: config.siblingGap || SIBLING_GAP,
    generationGap: config.generationGap || GENERATION_GAP,
  };
}

function personX(person) {
  return toInt(person?.tree_x, 0);
}

function personY(person) {
  return toInt(person?.tree_y, 0);
}

function generationOf(person) {
  return toInt(person?.generation, 1) || 1;
}

export function displayNodeIdForCouple(fatherId, motherId, familyId) {
  const ids = [Number(fatherId), Number(motherId)].filter(Number.isFinite).sort((a, b) => a - b);
  return ids.length ? `couple_${ids.join("_")}` : `couple_family_${Number(familyId) || "unknown"}`;
}

export function buildDisplayTree(people = [], families = [], childRows = [], options = {}) {
  const exportMode = Boolean(options.exportMode);
  const cardOrientation = normalizeCardOrientation(options.cardOrientation);
  const nodePositions = options.nodePositions || {};
  const peopleById = new Map(asArray(people).map((person) => [Number(person.id), person]));
  const childRowsByFamily = new Map();
  asArray(childRows).forEach((row) => {
    const familyId = Number(row.family_id);
    if (!childRowsByFamily.has(familyId)) childRowsByFamily.set(familyId, []);
    childRowsByFamily.get(familyId).push(row);
  });

  const usedPersonIds = new Set();
  const nodes = [];
  const nodeByPersonId = new Map();
  const nodeByFamilyId = new Map();

  asArray(families)
    .slice()
    .sort((a, b) => Number(a.id) - Number(b.id))
    .forEach((family) => {
      const husband = peopleById.get(Number(family.father_id));
      const wife = peopleById.get(Number(family.mother_id));
      if (!husband || !wife) return;
      if (usedPersonIds.has(Number(husband.id)) || usedPersonIds.has(Number(wife.id))) return;

      const size = nodeSize(DISPLAY_NODE_TYPE.COUPLE, exportMode, cardOrientation);
      const leftX = Math.min(personX(husband), personX(wife));
      const rightX = Math.max(personX(husband), personX(wife)) + size.width;
      const x = Math.round((leftX + rightX) / 2 - size.width / 2);
      const y = Math.min(personY(husband), personY(wife));
      const node = {
        id: displayNodeIdForCouple(husband.id, wife.id, family.id),
        type: DISPLAY_NODE_TYPE.COUPLE,
        familyId: Number(family.id),
        husband,
        wife,
        generation: Math.min(generationOf(husband), generationOf(wife)),
        x,
        y,
        width: size.width,
        height: size.height,
        cardOrientation,
        personIds: [Number(husband.id), Number(wife.id)],
        children: asArray(childRowsByFamily.get(Number(family.id)))
          .map((row) => ({ ...row, person: peopleById.get(Number(row.person_id)) }))
          .filter((row) => row.person)
          .sort(siblingSort)
          .map((row) => row.person),
      };
      const savedPosition = nodePositions[node.id];
      if (savedPosition) {
        node.x = toInt(savedPosition.x, node.x);
        node.y = toInt(savedPosition.y, node.y);
      }
      nodes.push(node);
      usedPersonIds.add(Number(husband.id));
      usedPersonIds.add(Number(wife.id));
      nodeByPersonId.set(Number(husband.id), node);
      nodeByPersonId.set(Number(wife.id), node);
      nodeByFamilyId.set(Number(family.id), node);
    });

  asArray(people).forEach((person) => {
    if (usedPersonIds.has(Number(person.id))) return;
    const size = nodeSize(DISPLAY_NODE_TYPE.SINGLE, exportMode, cardOrientation);
    const node = {
      id: `single_${Number(person.id)}`,
      type: DISPLAY_NODE_TYPE.SINGLE,
      person,
      generation: generationOf(person),
      x: personX(person),
      y: personY(person),
      width: size.width,
      height: size.height,
      cardOrientation,
      personIds: [Number(person.id)],
      children: [],
    };
    const savedPosition = nodePositions[node.id];
    if (savedPosition) {
      node.x = toInt(savedPosition.x, node.x);
      node.y = toInt(savedPosition.y, node.y);
    }
    nodes.push(node);
    nodeByPersonId.set(Number(person.id), node);
  });

  if (!options.packRows) {
    return {
      nodes: nodes.slice().sort((a, b) => a.y - b.y || a.x - b.x),
      nodeByPersonId,
      nodeByFamilyId,
    };
  }

  const grouped = new Map();
  nodes.forEach((node) => {
    const generation = node.generation || 1;
    if (!grouped.has(generation)) grouped.set(generation, []);
    grouped.get(generation).push(node);
  });

  const generations = [...grouped.keys()].sort((a, b) => a - b);
  const spacing = layoutConfig(options);
  const rowWidths = generations.map((generation) => {
    const row = grouped.get(generation) || [];
    return row.reduce((sum, node) => sum + node.width, 0) + Math.max(0, row.length - 1) * spacing.siblingGap;
  });
  const maxRowWidth = Math.max(1, ...rowWidths);

  const positionedNodes = [];
  generations.forEach((generation) => {
    const row = (grouped.get(generation) || [])
      .slice()
      .sort((a, b) => a.x - b.x || a.y - b.y || personSort(a.husband || a.person || {}, b.husband || b.person || {}));
    const rowWidth = row.reduce((sum, node) => sum + node.width, 0) + Math.max(0, row.length - 1) * spacing.siblingGap;
    let cursorX = CANVAS_PADDING + Math.max(0, (maxRowWidth - rowWidth) / 2);
    const y = CANVAS_PADDING + Math.max(0, generation - 1) * (spacing.cardHeight + spacing.generationGap);
    row.forEach((node) => {
      const nextNode = {
        ...node,
        x: Math.round(cursorX),
        y: Math.round(y),
      };
      positionedNodes.push(nextNode);
      nextNode.personIds.forEach((personId) => nodeByPersonId.set(Number(personId), nextNode));
      if (nextNode.familyId) nodeByFamilyId.set(Number(nextNode.familyId), nextNode);
      cursorX += node.width + spacing.siblingGap;
    });
  });

  return {
    nodes: positionedNodes,
    nodeByPersonId,
    nodeByFamilyId,
  };
}

function centerX(node) {
  return node.x + node.width / 2;
}

function topY(node) {
  return node.y;
}

function bottomY(node) {
  return node.y + node.height;
}

function leftX(node) {
  return node.x;
}

function rightX(node) {
  return node.x + node.width;
}

function centerY(node) {
  return node.y + node.height / 2;
}

function roundedElbow(points = [], radius = 16) {
  const clean = points.map((point) => ({ x: Math.round(point.x), y: Math.round(point.y) }));
  const parts = [`M ${clean[0].x} ${clean[0].y}`];
  for (let index = 1; index < clean.length; index += 1) {
    const current = clean[index];
    const next = clean[index + 1];
    const prev = clean[index - 1];
    if (!next) {
      parts.push(`L ${current.x} ${current.y}`);
      continue;
    }
    const incomingX = current.x - prev.x;
    const incomingY = current.y - prev.y;
    const outgoingX = next.x - current.x;
    const outgoingY = next.y - current.y;
    const isElbow = incomingX !== 0 && outgoingY !== 0 || incomingY !== 0 && outgoingX !== 0;
    if (!isElbow) {
      parts.push(`L ${current.x} ${current.y}`);
      continue;
    }
    const r = Math.min(radius, Math.hypot(incomingX, incomingY) / 2, Math.hypot(outgoingX, outgoingY) / 2);
    const before = {
      x: current.x - Math.sign(incomingX) * r,
      y: current.y - Math.sign(incomingY) * r,
    };
    const after = {
      x: current.x + Math.sign(outgoingX) * r,
      y: current.y + Math.sign(outgoingY) * r,
    };
    parts.push(`L ${Math.round(before.x)} ${Math.round(before.y)}`);
    parts.push(`Q ${current.x} ${current.y} ${Math.round(after.x)} ${Math.round(after.y)}`);
  }
  return parts.join(" ");
}

function routeNumber(route, key, fallbackKey) {
  const value = Number(route?.[key]);
  if (Number.isFinite(value)) return value;
  const fallback = Number(route?.[fallbackKey]);
  return Number.isFinite(fallback) ? fallback : null;
}

function boundedRoute(route, key, fallbackKey, defaultValue, min, max) {
  return snapLine(clamp(routeNumber(route, key, fallbackKey) ?? defaultValue, min, max));
}

function projectPointToNodeEdge(node, point) {
  const x = clamp(Number(point?.x), leftX(node), rightX(node));
  const y = clamp(Number(point?.y), topY(node), bottomY(node));
  const distances = [
    { side: "left", value: Math.abs(x - leftX(node)) },
    { side: "right", value: Math.abs(rightX(node) - x) },
    { side: "top", value: Math.abs(y - topY(node)) },
    { side: "bottom", value: Math.abs(bottomY(node) - y) },
  ].sort((a, b) => a.value - b.value);

  if (distances[0]?.side === "left") return { x: leftX(node), y };
  if (distances[0]?.side === "right") return { x: rightX(node), y };
  if (distances[0]?.side === "top") return { x, y: topY(node) };
  return { x, y: bottomY(node) };
}

function resolveParentAnchor(route, node, defaultPoint) {
  const rawPoint = {
    x: routeNumber(route, "parentAnchorX") ?? defaultPoint.x,
    y: routeNumber(route, "parentAnchorY") ?? defaultPoint.y,
  };
  return projectPointToNodeEdge(node, rawPoint);
}

function spreadOf(values = []) {
  const safeValues = values.filter(Number.isFinite);
  if (!safeValues.length) return 0;
  return Math.max(...safeValues) - Math.min(...safeValues);
}

function averageOf(values = []) {
  const safeValues = values.filter(Number.isFinite);
  if (!safeValues.length) return 0;
  return safeValues.reduce((sum, value) => sum + value, 0) / safeValues.length;
}

function resolveDisplayRouteAxis(route = {}, parentNode, childNodes = []) {
  const configured = String(route?.axis || "").toLowerCase();
  if (configured === "horizontal" || configured === "vertical") return configured;

  const childCenters = childNodes.map((childNode) => ({
    x: centerX(childNode),
    y: centerY(childNode),
  }));
  const xSpread = spreadOf(childCenters.map((point) => point.x));
  const ySpread = spreadOf(childCenters.map((point) => point.y));
  const minChildTop = Math.min(...childNodes.map((childNode) => topY(childNode)));
  const parentBottom = bottomY(parentNode);

  if (childNodes.length <= 1) {
    const child = childNodes[0];
    const dx = Math.abs(centerX(child) - centerX(parentNode));
    const dy = Math.abs(centerY(child) - centerY(parentNode));
    return dy >= dx * 0.7 ? "horizontal" : "vertical";
  }

  if (minChildTop >= parentBottom - 12 && xSpread >= ySpread * 0.75) return "horizontal";
  return ySpread > xSpread * 0.65 ? "vertical" : "horizontal";
}

function relatedIdsFor(parentNode, childNode) {
  return [...parentNode.personIds, ...childNode.personIds].map(Number).filter(Number.isFinite);
}

export function buildDisplayTreeLines(displayTree, families = [], childRows = [], lineRoutes = {}) {
  const nodeByPersonId = displayTree?.nodeByPersonId || new Map();
  const nodeByFamilyId = displayTree?.nodeByFamilyId || new Map();
  const childrenByFamily = new Map();
  asArray(childRows).forEach((row) => {
    const familyId = Number(row.family_id);
    if (!childrenByFamily.has(familyId)) childrenByFamily.set(familyId, []);
    childrenByFamily.get(familyId).push(row);
  });

  const lines = [];
  asArray(families).forEach((family) => {
    const familyId = Number(family.id);
    const parentNode = nodeByFamilyId.get(familyId)
      || nodeByPersonId.get(Number(family.father_id))
      || nodeByPersonId.get(Number(family.mother_id));
    if (!parentNode) return;

    const childNodes = [];
    const seenChildNodeIds = new Set();
    asArray(childrenByFamily.get(familyId)).forEach((row) => {
      const childNode = nodeByPersonId.get(Number(row.person_id));
      if (!childNode || childNode.id === parentNode.id || seenChildNodeIds.has(childNode.id)) return;
      seenChildNodeIds.add(childNode.id);
      childNodes.push(childNode);
    });
    childNodes.sort((a, b) => centerX(a) - centerX(b) || topY(a) - topY(b));
    if (!childNodes.length) return;

    const relatedPersonIds = [
      ...parentNode.personIds,
      ...childNodes.flatMap((childNode) => childNode.personIds),
    ].map(Number).filter(Number.isFinite);
    const route = lineRoutes?.[familyId] || {};

    const parentX = centerX(parentNode);
    const parentBottom = bottomY(parentNode);
    const childAnchors = childNodes.map((childNode) => ({
      id: childNode.id,
      x: centerX(childNode),
      y: topY(childNode),
      sideY: centerY(childNode),
      left: leftX(childNode),
      right: rightX(childNode),
    }));
    const routeAxis = resolveDisplayRouteAxis(route, parentNode, childNodes);

    if (routeAxis === "vertical") {
      const parentMiddleY = centerY(parentNode);
      const parentMiddleX = centerX(parentNode);
      const childLeft = Math.min(...childAnchors.map((anchor) => anchor.left));
      const childRight = Math.max(...childAnchors.map((anchor) => anchor.right));
      const averageChildX = averageOf(childAnchors.map((anchor) => anchor.x));
      const naturalBaseX = parentMiddleX > averageChildX ? childRight + 34 : childLeft - 34;
      const minBaseX = Math.min(leftX(parentNode), childLeft, parentMiddleX) - Math.max(120, parentNode.width * 0.35);
      const maxBaseX = Math.max(rightX(parentNode), childRight, parentMiddleX) + Math.max(120, parentNode.width * 0.35);
      const baseX = boundedRoute(route, "baseX", "directX", naturalBaseX, minBaseX, maxBaseX);
      const defaultParentSideX = baseX <= parentMiddleX ? leftX(parentNode) : rightX(parentNode);
      const parentAnchor = resolveParentAnchor(route, parentNode, { x: defaultParentSideX, y: parentMiddleY });
      const parentMinY = Math.min(parentAnchor.y, ...childAnchors.map((anchor) => anchor.sideY)) - 120;
      const parentMaxY = Math.max(parentAnchor.y, ...childAnchors.map((anchor) => anchor.sideY)) + 120;
      const parentBranchY = boundedRoute(route, "parentBranchY", "trunkY", parentAnchor.y, parentMinY, parentMaxY);
      const childBranchRoutes = childNodes.map((childNode, index) => {
        const anchor = childAnchors[index];
        const routeKey = `childY:${childNode.id}`;
        const minY = Math.min(parentBranchY, anchor.sideY) - 120;
        const maxY = Math.max(parentBranchY, anchor.sideY) + 120;
        return {
          childNode,
          anchor,
          routeKey,
          branchY: boundedRoute(route, routeKey, null, anchor.sideY, minY, maxY),
          minY,
          maxY,
        };
      });
      const axisMinY = Math.min(parentBranchY, ...childBranchRoutes.map((child) => child.branchY));
      const axisMaxY = Math.max(parentBranchY, ...childBranchRoutes.map((child) => child.branchY));

      lines.push({
        id: `display-family-${familyId}-axis`,
        edgeId: `display-family-${familyId}-axis`,
        familyId,
        routeKey: "baseX",
        dragAxis: "x",
        type: "blood",
        color: CHILD_LINE_COLOR,
        relatedPersonIds,
        x: baseX,
        y: Math.round((axisMinY + axisMaxY) / 2),
        minX: minBaseX,
        maxX: maxBaseX,
        d: roundedElbow([{ x: baseX, y: axisMinY }, { x: baseX, y: axisMaxY }]),
      });
      lines.push({
        id: `display-family-${familyId}-parent`,
        edgeId: `display-family-${familyId}-parent`,
        familyId,
        routeKey: "parentBranchY",
        dragAxis: "y",
        type: "blood",
        color: CHILD_LINE_COLOR,
        relatedPersonIds,
        x: Math.round((parentAnchor.x + baseX) / 2),
        y: parentBranchY,
        minY: parentMinY,
        maxY: parentMaxY,
        d: roundedElbow([
          { x: parentAnchor.x, y: parentAnchor.y },
          { x: parentAnchor.x, y: parentBranchY },
          { x: baseX, y: parentBranchY },
        ]),
      });
      lines.push({
        id: `display-family-${familyId}-parent-anchor-control`,
        familyId,
        routeKey: "parentAnchor",
        routeKeyX: "parentAnchorX",
        routeKeyY: "parentAnchorY",
        type: "route-control",
        dragAxis: "xy",
        x: parentAnchor.x,
        y: parentAnchor.y,
        minX: leftX(parentNode),
        maxX: rightX(parentNode),
        minY: topY(parentNode),
        maxY: bottomY(parentNode),
      });
      lines.push({
        id: `display-family-${familyId}-axis-control`,
        familyId,
        routeKey: "baseX",
        type: "route-control",
        dragAxis: "x",
        x: baseX,
        y: Math.round((axisMinY + axisMaxY) / 2),
        minX: minBaseX,
        maxX: maxBaseX,
      });
      lines.push({
        id: `display-family-${familyId}-parent-branch-control`,
        familyId,
        routeKey: "parentBranchY",
        type: "route-control",
        dragAxis: "y",
        x: Math.round((parentAnchor.x + baseX) / 2),
        y: parentBranchY,
        minY: parentMinY,
        maxY: parentMaxY,
      });
      childBranchRoutes.forEach(({ childNode, anchor, routeKey, branchY, minY, maxY }) => {
        const childSideX = baseX <= anchor.x ? anchor.left : anchor.right;
        const edgeId = `display-family-${familyId}-child-${childNode.id}`;
        const controlX = Math.round((baseX + childSideX) / 2);
        lines.push({
          id: edgeId,
          edgeId,
          familyId,
          routeKey,
          dragAxis: "y",
          type: "blood",
          color: CHILD_LINE_COLOR,
          relatedPersonIds: relatedIdsFor(parentNode, childNode),
          x: controlX,
          y: branchY,
          minY,
          maxY,
          d: roundedElbow([
            { x: baseX, y: branchY },
            { x: childSideX, y: branchY },
            { x: childSideX, y: anchor.sideY },
          ]),
        });
        lines.push({
          id: `display-family-${familyId}-child-control-${childNode.id}`,
          familyId,
          routeKey,
          type: "route-control",
          dragAxis: "y",
          x: controlX,
          y: branchY,
          minY,
          maxY,
        });
      });
      return;
    }

    const minChildTop = Math.min(...childAnchors.map((anchor) => anchor.y));
    const parentAnchor = resolveParentAnchor(route, parentNode, { x: parentX, y: parentBottom });
    const minBusY = parentBottom + 30;
    const maxBusY = Math.max(minBusY, minChildTop - 28);
    const naturalBusY = Math.round(parentBottom + Math.max(34, (minChildTop - parentBottom) * 0.46));
    const busY = boundedRoute(route, "baseY", "childJoinY", naturalBusY, minBusY, maxBusY);
    const childLeft = Math.min(...childAnchors.map((anchor) => anchor.x));
    const childRight = Math.max(...childAnchors.map((anchor) => anchor.x));
    const minTrunkX = Math.min(parentAnchor.x, childLeft) - Math.max(110, parentNode.width * 0.45);
    const maxTrunkX = Math.max(parentAnchor.x, childRight) + Math.max(110, parentNode.width * 0.45);
    const trunkX = boundedRoute(route, "trunkX", "parentBranchX", parentAnchor.x, minTrunkX, maxTrunkX);
    const childBranchRoutes = childNodes.map((childNode, index) => {
      const anchor = childAnchors[index];
      const routeKey = `childX:${childNode.id}`;
      const minX = Math.min(trunkX, anchor.x, childLeft) - 120;
      const maxX = Math.max(trunkX, anchor.x, childRight) + 120;
      return {
        childNode,
        anchor,
        routeKey,
        branchX: boundedRoute(route, routeKey, null, anchor.x, minX, maxX),
        minX,
        maxX,
      };
    });
    const busLeft = Math.min(trunkX, ...childBranchRoutes.map((child) => child.branchX));
    const busRight = Math.max(trunkX, ...childBranchRoutes.map((child) => child.branchX));
    lines.push({
      id: `display-family-${familyId}-parent`,
      edgeId: `display-family-${familyId}-parent`,
      familyId,
      routeKey: "trunkX",
      dragAxis: "x",
      type: "blood",
      color: CHILD_LINE_COLOR,
      relatedPersonIds,
      x: trunkX,
      y: Math.round((parentBottom + busY) / 2),
      minX: minTrunkX,
      maxX: maxTrunkX,
      d: roundedElbow([
        { x: parentAnchor.x, y: parentAnchor.y },
        { x: trunkX, y: parentAnchor.y },
        { x: trunkX, y: busY },
      ]),
    });
    lines.push({
      id: `display-family-${familyId}-parent-anchor-control`,
      familyId,
      routeKey: "parentAnchor",
      routeKeyX: "parentAnchorX",
      routeKeyY: "parentAnchorY",
      type: "route-control",
      dragAxis: "xy",
      x: parentAnchor.x,
      y: parentAnchor.y,
      minX: leftX(parentNode),
      maxX: rightX(parentNode),
      minY: topY(parentNode),
      maxY: bottomY(parentNode),
    });
    lines.push({
      id: `display-family-${familyId}-bus`,
      edgeId: `display-family-${familyId}-bus`,
      familyId,
      routeKey: "baseY",
      dragAxis: "y",
      type: "blood",
      color: CHILD_LINE_COLOR,
      relatedPersonIds,
      x: Math.round((busLeft + busRight) / 2),
      y: busY,
      minY: minBusY,
      maxY: maxBusY,
      d: `M ${Math.round(busLeft)} ${busY} L ${Math.round(busRight)} ${busY}`,
    });
    lines.push({
      id: `display-family-${familyId}-trunk-control`,
      familyId,
      routeKey: "trunkX",
      type: "route-control",
      dragAxis: "x",
      x: trunkX,
      y: Math.round((parentBottom + busY) / 2),
      minX: minTrunkX,
      maxX: maxTrunkX,
    });
    lines.push({
      id: `display-family-${familyId}-base-control`,
      familyId,
      routeKey: "baseY",
      type: "route-control",
      dragAxis: "y",
      x: Math.round((busLeft + busRight) / 2),
      y: busY,
      minY: minBusY,
      maxY: maxBusY,
    });
    childBranchRoutes.forEach(({ childNode, anchor, routeKey, branchX, minX, maxX }) => {
      const edgeId = `display-family-${familyId}-child-${childNode.id}`;
      lines.push({
        id: edgeId,
        edgeId,
        familyId,
        routeKey,
        dragAxis: "x",
        type: "blood",
        color: CHILD_LINE_COLOR,
        relatedPersonIds: relatedIdsFor(parentNode, childNode),
        x: branchX,
        y: Math.round((busY + anchor.y) / 2),
        minX,
        maxX,
        d: roundedElbow([
          { x: branchX, y: busY },
          { x: branchX, y: anchor.y },
          { x: anchor.x, y: anchor.y },
        ]),
      });
      lines.push({
        id: `display-family-${familyId}-child-control-${childNode.id}`,
        familyId,
        routeKey,
        type: "route-control",
        dragAxis: "x",
        x: branchX,
        y: Math.round((busY + anchor.y) / 2),
        minX,
        maxX,
      });
    });
  });
  return lines;
}

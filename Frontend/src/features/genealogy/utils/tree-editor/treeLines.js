import { BLOOD_LINE_COLORS, SOURCE_BRANCH_STEP } from "./treeConstants";
import { asArray, clamp, personSort, siblingSort, snap, toInt } from "./treePersonUtils";
import { getCardSize } from "./treeStorage";

export function centerOf(person, cardSizes = {}) {
  const size = getCardSize(cardSizes, person?.id);
  return {
    x: toInt(person.tree_x, 0) + size.width / 2,
    y: toInt(person.tree_y, 0) + size.height / 2,
  };
}

export function bottomOf(person, cardSizes = {}) {
  const size = getCardSize(cardSizes, person?.id);
  return toInt(person.tree_y, 0) + size.height;
}

export function rightOf(person, cardSizes = {}) {
  const size = getCardSize(cardSizes, person?.id);
  return toInt(person.tree_x, 0) + size.width;
}

function rectOf(person, cardSizes = {}) {
  const size = getCardSize(cardSizes, person?.id);
  const left = toInt(person?.tree_x, 0);
  const top = toInt(person?.tree_y, 0);
  return {
    left,
    top,
    right: left + size.width,
    bottom: top + size.height,
    centerX: left + size.width / 2,
    centerY: top + size.height / 2,
  };
}

function unionRect(rects = []) {
  const safeRects = rects.filter(Boolean);
  if (!safeRects.length) return null;
  const left = Math.min(...safeRects.map((rect) => rect.left));
  const top = Math.min(...safeRects.map((rect) => rect.top));
  const right = Math.max(...safeRects.map((rect) => rect.right));
  const bottom = Math.max(...safeRects.map((rect) => rect.bottom));
  return {
    left,
    top,
    right,
    bottom,
    centerX: (left + right) / 2,
    centerY: (top + bottom) / 2,
  };
}

export function numbersFromPath(pathText) {
  return String(pathText || "")
    .match(/-?\d+(?:\.\d+)?/g)
    ?.map(Number)
    .filter(Number.isFinite) || [];
}

const ROUTE_SIDE_PADDING = 160;
const ROUTE_SIDE_GAP = 14;
const ROUTE_VERTICAL_GAP = 38;
const ROUTE_CHILD_CLEARANCE = 32;
const ROUTE_BUS_PULLBACK = 72;
const ROUTE_BRANCH_PADDING = 120;

function spreadOf(values = []) {
  const numbers = values.filter(Number.isFinite);
  if (!numbers.length) return 0;
  return Math.max(...numbers) - Math.min(...numbers);
}

function averageOf(values = []) {
  const numbers = values.filter(Number.isFinite);
  if (!numbers.length) return 0;
  return numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
}

function routeNumber(route, key, fallbackKey) {
  const value = Number(route?.[key]);
  if (Number.isFinite(value)) return value;
  const fallback = Number(route?.[fallbackKey]);
  return Number.isFinite(fallback) ? fallback : null;
}

function projectToRectEdge(point, rect) {
  const x = clamp(Number(point?.x), rect.left, rect.right);
  const y = clamp(Number(point?.y), rect.top, rect.bottom);
  const distances = [
    { side: "left", value: Math.abs(x - rect.left) },
    { side: "right", value: Math.abs(rect.right - x) },
    { side: "top", value: Math.abs(y - rect.top) },
    { side: "bottom", value: Math.abs(rect.bottom - y) },
  ].sort((a, b) => a.value - b.value);

  if (distances[0]?.side === "left") return { x: rect.left, y };
  if (distances[0]?.side === "right") return { x: rect.right, y };
  if (distances[0]?.side === "top") return { x, y: rect.top };
  return { x, y: rect.bottom };
}

function resolveFamilyAxis(route = {}, childCenters = [], xSpread = 0, ySpread = 0) {
  const configured = String(route?.axis || "auto").toLowerCase();
  if (configured === "horizontal") return "horizontal";
  if (configured === "vertical") return "vertical";
  if (childCenters.length <= 1) return "vertical";

  return ySpread > xSpread * 0.6 ? "vertical" : "horizontal";
}

export function buildTreeLines(people, families, childRows, lineRoutes = {}, cardSizes = {}) {
  const peopleMap = new Map(people.map((person) => [Number(person.id), person]));
  const childrenByFamily = new Map();

  asArray(childRows).forEach((row) => {
    const familyId = Number(row.family_id);
    const childId = Number(row.person_id);
    if (!childrenByFamily.has(familyId)) childrenByFamily.set(familyId, []);
    childrenByFamily.get(familyId).push({
      person_id: childId,
      sort_order: toInt(row.sort_order, 0),
    });
  });

  const lines = [];
  const branchFamilyKeys = new Map();
  const familyRows = asArray(families);

  familyRows.forEach((family) => {
    const familyId = Number(family.id);
    const parents = [peopleMap.get(Number(family.father_id)), peopleMap.get(Number(family.mother_id))].filter(Boolean);
    const children = asArray(childrenByFamily.get(familyId)).filter((row) => peopleMap.has(Number(row.person_id)));
    if (!parents.length || !children.length) return;

    const lineParent = peopleMap.get(Number(family.father_id)) || parents[0];
    const parentGeneration = toInt(lineParent?.generation, 1);
    const groupKey = `${parentGeneration}:${familyId}`;
    const parentX = Math.min(...parents.map((parent) => toInt(parent.tree_x, 0)));

    if (!branchFamilyKeys.has(groupKey)) {
      branchFamilyKeys.set(groupKey, {
        generation: parentGeneration,
        minX: parentX,
      });
      return;
    }

    const current = branchFamilyKeys.get(groupKey);
    current.minX = Math.min(current.minX, parentX);
  });

  const branchTierByFamily = new Map();
  const colorIndexByFamily = new Map();
  const familyGroupsByGeneration = new Map();
  branchFamilyKeys.forEach((value, key) => {
    if (!familyGroupsByGeneration.has(value.generation)) familyGroupsByGeneration.set(value.generation, []);
    familyGroupsByGeneration.get(value.generation).push({ key, ...value });
  });
  familyGroupsByGeneration.forEach((groups) => {
    groups
      .slice()
      .sort((a, b) => a.minX - b.minX || String(a.key).localeCompare(String(b.key)))
      .forEach((group, index) => {
        branchTierByFamily.set(group.key, index);
        colorIndexByFamily.set(group.key, index);
      });
  });

  familyRows.forEach((family) => {
    const familyId = Number(family.id);
    if (!Number.isFinite(familyId)) return;

    const father = peopleMap.get(Number(family.father_id));
    const mother = peopleMap.get(Number(family.mother_id));
    const parents = [father, mother].filter(Boolean);
    const children = asArray(childrenByFamily.get(Number(family.id)))
      .map((row) => ({
        ...row,
        person: peopleMap.get(Number(row.person_id)),
      }))
      .filter((row) => row.person)
      .sort(siblingSort)
      .map((row) => row.person)
      .sort((a, b) => a.tree_x - b.tree_x || personSort(a, b));

    let coupleJoinPoint = null;

    if (father && mother) {
      const left = toInt(father.tree_x, 0) <= toInt(mother.tree_x, 0) ? father : mother;
      const right = left === father ? mother : father;
      const leftRect = rectOf(left, cardSizes);
      const rightRect = rectOf(right, cardSizes);
      const leftEdge = rightOf(left, cardSizes);
      const rightEdge = toInt(right.tree_x, 0);
      const y = Math.round((centerOf(father, cardSizes).y + centerOf(mother, cardSizes).y) / 2);
      const startX = rightEdge > leftEdge ? leftEdge : Math.round(centerOf(left, cardSizes).x);
      const endX = rightEdge > leftEdge ? rightEdge : Math.round(centerOf(right, cardSizes).x);
      coupleJoinPoint = {
        x: Math.round((startX + endX) / 2),
        y,
      };
      const savedSpouseY = Number(lineRoutes?.[familyId]?.spouseY);
      const spouseMinY = Math.min(toInt(father.tree_y, 0), toInt(mother.tree_y, 0)) + 24;
      const spouseMaxY = Math.max(bottomOf(father, cardSizes), bottomOf(mother, cardSizes)) - 24;
      const spouseY = snap(clamp(Number.isFinite(savedSpouseY) ? savedSpouseY : y, spouseMinY, spouseMaxY));
      const spouseLeftY = snap(clamp(routeNumber(lineRoutes?.[familyId], "spouseLeftY") ?? spouseY, leftRect.top + 18, leftRect.bottom - 18));
      const spouseRightY = snap(clamp(routeNumber(lineRoutes?.[familyId], "spouseRightY") ?? spouseY, rightRect.top + 18, rightRect.bottom - 18));
      const spouseMidX = snap(clamp(routeNumber(lineRoutes?.[familyId], "spouseMidX") ?? Math.round((startX + endX) / 2), Math.min(startX, endX), Math.max(startX, endX)));
      coupleJoinPoint.x = spouseMidX;
      coupleJoinPoint.y = Math.round((spouseLeftY + spouseRightY) / 2);

      lines.push({
        id: `family-${familyId}-spouse`,
        familyId,
        routeKey: "spouseY",
        type: "spouse",
        dragAxis: "x",
        x: spouseMidX,
        y: coupleJoinPoint.y,
        minX: Math.min(startX, endX),
        maxX: Math.max(startX, endX),
        d: `M ${startX} ${spouseLeftY} H ${spouseMidX} V ${spouseRightY} H ${endX}`,
      });
      lines.push({
        id: `family-${familyId}-spouse-left-control`,
        familyId,
        routeKey: "spouseLeftY",
        type: "route-control",
        dragAxis: "y",
        x: startX,
        y: spouseLeftY,
        minY: leftRect.top + 18,
        maxY: leftRect.bottom - 18,
      });
      lines.push({
        id: `family-${familyId}-spouse-right-control`,
        familyId,
        routeKey: "spouseRightY",
        type: "route-control",
        dragAxis: "y",
        x: endX,
        y: spouseRightY,
        minY: rightRect.top + 18,
        maxY: rightRect.bottom - 18,
      });
      lines.push({
        id: `family-${familyId}-spouse-mid-control`,
        familyId,
        routeKey: "spouseMidX",
        type: "route-control",
        dragAxis: "x",
        x: spouseMidX,
        y: coupleJoinPoint.y,
        minX: Math.min(startX, endX),
        maxX: Math.max(startX, endX),
      });
      lines.push({
        id: `family-${familyId}-spouse-legacy-control`,
        familyId,
        routeKey: "spouseY",
        type: "route-control",
        dragAxis: "y",
        x: spouseMidX,
        y: spouseY,
        minY: spouseMinY,
        maxY: spouseMaxY,
      });
    }

    if (!parents.length || !children.length) return;

    const lineParent = father || parents[0];
    const route = lineRoutes?.[familyId] || {};
    const parentRect = rectOf(lineParent, cardSizes);
    const coupleRect = father && mother ? unionRect([rectOf(father, cardSizes), rectOf(mother, cardSizes)]) : null;
    const parentAnchorBounds = coupleRect || parentRect;
    const defaultParentAnchor = coupleJoinPoint || { x: parentRect.centerX, y: parentRect.bottom };
    const rawParentAnchor = {
      x: routeNumber(route, "parentAnchorX") ?? defaultParentAnchor.x,
      y: routeNumber(route, "parentAnchorY") ?? defaultParentAnchor.y,
    };
    const parentAnchor = coupleRect
      ? {
        x: clamp(rawParentAnchor.x, parentAnchorBounds.left, parentAnchorBounds.right),
        y: clamp(rawParentAnchor.y, parentAnchorBounds.top, parentAnchorBounds.bottom),
      }
      : projectToRectEdge(rawParentAnchor, parentRect);
    const parentX = Math.round(parentAnchor.x);
    const parentBottomY = Math.round(parentAnchor.y);
    const childCenters = children.map((child) => {
      const size = getCardSize(cardSizes, child.id);
      const leftX = toInt(child.tree_x, 0);
      return {
        id: Number(child.id),
        x: Math.round(leftX + size.width / 2),
        y: toInt(child.tree_y, 0),
        sideY: Math.round(toInt(child.tree_y, 0) + size.height / 2),
        leftX,
        rightX: leftX + size.width,
      };
    });
    const busMinX = Math.min(parentX, ...childCenters.map((item) => item.x));
    const busMaxX = Math.max(parentX, ...childCenters.map((item) => item.x));
    const firstChildY = Math.min(...childCenters.map((item) => item.y));
    const familyKey = `${toInt(lineParent.generation, 1)}:${Number(family.id)}`;
    const sourceTier = branchTierByFamily.get(familyKey) || 0;
    const colorIndex = colorIndexByFamily.get(familyKey) || 0;
    const color = BLOOD_LINE_COLORS[colorIndex % BLOOD_LINE_COLORS.length];
    const lineId = `family-${familyId}`;
    lines.push({
      id: `${lineId}-parent-anchor-control`,
      familyId,
      routeKey: "parentAnchor",
      routeKeyX: "parentAnchorX",
      routeKeyY: "parentAnchorY",
      dragAxis: "xy",
      type: "route-control",
      color,
      x: parentX,
      y: parentBottomY,
      minX: parentAnchorBounds.left,
      maxX: parentAnchorBounds.right,
      minY: parentAnchorBounds.top,
      maxY: parentAnchorBounds.bottom,
    });
    const xSpread = spreadOf(childCenters.map((child) => child.x));
    const ySpread = spreadOf(childCenters.map((child) => child.y));
    const routeAxis = resolveFamilyAxis(route, childCenters, xSpread, ySpread);

    if (routeAxis === "vertical") {
      const childXs = childCenters.map((child) => child.x);
      const laneOffset = sourceTier * SOURCE_BRANCH_STEP;
      const childMinLeftX = Math.min(...childCenters.map((child) => child.leftX));
      const childMaxRightX = Math.max(...childCenters.map((child) => child.rightX));
      const averageChildX = averageOf(childXs);
      const naturalBaseX = parentX > averageChildX
        ? Math.round(childMaxRightX + ROUTE_SIDE_GAP + laneOffset)
        : Math.round(childMinLeftX - ROUTE_SIDE_GAP - laneOffset);
      const minBaseX = Math.min(parentX, childMinLeftX) - ROUTE_SIDE_PADDING - laneOffset;
      const maxBaseX = Math.max(parentX, childMaxRightX) + ROUTE_SIDE_PADDING + laneOffset;
      const savedBaseX = routeNumber(route, "baseX", "directX");
      const baseX = snap(clamp(savedBaseX ?? naturalBaseX, minBaseX, maxBaseX));
      const childBranchRoutes = childCenters.map((child) => {
        const routeKey = `childY:${child.id}`;
        const childAnchorX = baseX <= child.x ? child.leftX : child.rightX;
        const minY = Math.min(parentBottomY, child.sideY) - ROUTE_BRANCH_PADDING;
        const maxY = Math.max(parentBottomY, child.sideY) + ROUTE_BRANCH_PADDING;
        const savedBranchY = routeNumber(route, routeKey);
        const branchY = snap(clamp(savedBranchY ?? child.sideY, minY, maxY));
        return {
          ...child,
          routeKey,
          childAnchorX,
          branchY,
          minY,
          maxY,
        };
      });
      const minParentBranchY = Math.min(parentBottomY, ...childBranchRoutes.map((child) => child.branchY)) - ROUTE_BRANCH_PADDING;
      const maxParentBranchY = Math.max(parentBottomY, ...childBranchRoutes.map((child) => child.branchY)) + ROUTE_BRANCH_PADDING;
      const parentBranchY = snap(clamp(routeNumber(route, "parentBranchY") ?? parentBottomY, minParentBranchY, maxParentBranchY));
      const axisMinY = Math.min(parentBranchY, ...childBranchRoutes.map((child) => child.branchY));
      const axisMaxY = Math.max(parentBranchY, ...childBranchRoutes.map((child) => child.branchY));
      const controlY = Math.round((axisMinY + axisMaxY) / 2);
      console.log("family route", {
        familyId,
        axis: routeAxis,
        xSpread,
        ySpread,
        childCount: children.length,
        baseX,
        baseY: null,
      });
      const bloodDragMeta = {
        familyId,
        routeKey: "baseX",
        dragAxis: "x",
        x: baseX,
        y: controlY,
        minX: minBaseX,
        maxX: maxBaseX,
      };

      lines.push({
        id: `${lineId}-axis`,
        ...bloodDragMeta,
        type: "blood",
        color,
        d: `M ${baseX} ${axisMinY} V ${axisMaxY}`,
      });

      const parentBranchMeta = {
        familyId,
        routeKey: "parentBranchY",
        dragAxis: "y",
        x: Math.round((parentX + baseX) / 2),
        y: parentBranchY,
        minY: minParentBranchY,
        maxY: maxParentBranchY,
      };

      lines.push({
        id: `${lineId}-parent`,
        ...parentBranchMeta,
        type: "blood",
        color,
        d: `M ${parentX} ${parentBottomY} V ${parentBranchY} H ${baseX}`,
      });
      lines.push({
        id: `${lineId}-parent-branch-control`,
        ...parentBranchMeta,
        type: "route-control",
        color,
      });

      childBranchRoutes
        .slice()
        .sort((a, b) => a.branchY - b.branchY || a.x - b.x || a.id - b.id)
        .forEach((child) => {
          const childControlX = Math.round((baseX + child.childAnchorX) / 2);
          const childDragMeta = {
            familyId,
            routeKey: child.routeKey,
            dragAxis: "y",
            x: childControlX,
            y: child.branchY,
            minY: child.minY,
            maxY: child.maxY,
          };
          lines.push({
            id: `${lineId}-child-${child.id}`,
            ...childDragMeta,
            type: "blood",
            color,
            d: `M ${baseX} ${child.branchY} H ${child.childAnchorX} V ${child.sideY}`,
          });
          lines.push({
            id: `${lineId}-child-control-${child.id}`,
            ...childDragMeta,
            type: "route-control",
            color,
          });
        });

      lines.push({
        id: `${lineId}-control`,
        familyId,
        routeKey: "baseX",
        dragAxis: "x",
        type: "route-control",
        color,
        x: baseX,
        y: controlY,
        minX: minBaseX,
        maxX: maxBaseX,
      });
      return;
    }

    const savedBaseY = Number(route?.baseY);
    const minBranchY = parentBottomY + ROUTE_VERTICAL_GAP;
    const maxBranchY = Math.max(minBranchY, firstChildY - ROUTE_CHILD_CLEARANCE);
    const naturalBaseY = Math.round(Math.min(Math.max(minBranchY, firstChildY - ROUTE_BUS_PULLBACK) + sourceTier * SOURCE_BRANCH_STEP, maxBranchY));
    const baseY = snap(clamp(Number.isFinite(savedBaseY) ? savedBaseY : naturalBaseY, minBranchY, maxBranchY));
    const childBranchRoutes = childCenters.map((child) => {
      const routeKey = `childX:${child.id}`;
      const minX = Math.min(busMinX, child.x) - ROUTE_BRANCH_PADDING;
      const maxX = Math.max(busMaxX, child.x) + ROUTE_BRANCH_PADDING;
      const savedBranchX = routeNumber(route, routeKey);
      const branchX = snap(clamp(savedBranchX ?? child.x, minX, maxX));
      return {
        ...child,
        routeKey,
        branchX,
        minX,
        maxX,
      };
    });
    const routedBusMinX = Math.min(parentX, ...childBranchRoutes.map((child) => child.branchX));
    const routedBusMaxX = Math.max(parentX, ...childBranchRoutes.map((child) => child.branchX));
    const minParentBranchX = Math.min(parentX, routedBusMinX) - ROUTE_BRANCH_PADDING;
    const maxParentBranchX = Math.max(parentX, routedBusMaxX) + ROUTE_BRANCH_PADDING;
    const parentBranchX = snap(clamp(routeNumber(route, "parentBranchX") ?? parentX, minParentBranchX, maxParentBranchX));
    const finalBusMinX = Math.min(routedBusMinX, parentBranchX);
    const finalBusMaxX = Math.max(routedBusMaxX, parentBranchX);
    console.log("family route", {
      familyId,
      axis: routeAxis,
      xSpread,
      ySpread,
      childCount: children.length,
      baseX: null,
      baseY,
    });

    const bloodDragMeta = { familyId, routeKey: "baseY", dragAxis: "y", x: (finalBusMinX + finalBusMaxX) / 2, y: baseY, minY: minBranchY, maxY: maxBranchY };
    const parentBranchMeta = {
      familyId,
      routeKey: "parentBranchX",
      dragAxis: "x",
      x: parentBranchX,
      y: Math.round((parentBottomY + baseY) / 2),
      minX: minParentBranchX,
      maxX: maxParentBranchX,
    };
    lines.push({ id: `${lineId}-parent`, ...parentBranchMeta, type: "blood", color, d: `M ${parentX} ${parentBottomY} H ${parentBranchX} V ${baseY}` });
    lines.push({ id: `${lineId}-parent-branch-control`, ...parentBranchMeta, type: "route-control", color });
    lines.push({ id: `${lineId}-bus`, ...bloodDragMeta, type: "blood", color, d: `M ${finalBusMinX} ${baseY} H ${finalBusMaxX}` });
    childBranchRoutes.forEach((child) => {
      const childDragMeta = {
        familyId,
        routeKey: child.routeKey,
        dragAxis: "x",
        x: child.branchX,
        y: Math.round((baseY + child.y) / 2),
        minX: child.minX,
        maxX: child.maxX,
      };
      lines.push({
        id: `${lineId}-child-${child.id}`,
        ...childDragMeta,
        type: "blood",
        color,
        d: `M ${child.branchX} ${baseY} V ${child.y} H ${child.x}`,
      });
      lines.push({
        id: `${lineId}-child-control-${child.id}`,
        ...childDragMeta,
        type: "route-control",
        color,
      });
    });

    lines.push({
      id: `${lineId}-control`,
      familyId,
      routeKey: "baseY",
      dragAxis: "y",
      type: "route-control",
      color,
      x: (finalBusMinX + finalBusMaxX) / 2,
      y: baseY,
      minY: minBranchY,
      maxY: maxBranchY,
    });
  });

  return lines;
}

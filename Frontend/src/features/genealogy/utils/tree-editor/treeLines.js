import { BLOOD_LINE_COLORS, SOURCE_BRANCH_STEP } from "./treeConstants";
import { asArray, clamp, personSort, siblingSort, snap, snapLine, toInt } from "./treePersonUtils";
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

export function numbersFromPath(pathText) {
  return String(pathText || "")
    .match(/-?\d+(?:\.\d+)?/g)
    ?.map(Number)
    .filter(Number.isFinite) || [];
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
      coupleJoinPoint.y = spouseY;

      lines.push({
        id: `family-${familyId}-spouse`,
        familyId,
        routeKey: "spouseY",
        type: "spouse",
        dragAxis: "y",
        minY: spouseMinY,
        maxY: spouseMaxY,
        d: `M ${startX} ${spouseY} H ${endX}`,
      });
    }

    if (!parents.length || !children.length) return;

    const lineParent = father || parents[0];
    const parentX = coupleJoinPoint ? coupleJoinPoint.x : Math.round(centerOf(lineParent, cardSizes).x);
    const parentBottomY = coupleJoinPoint ? coupleJoinPoint.y : bottomOf(lineParent, cardSizes);
    const childCenters = children.map((child) => ({
      x: centerOf(child, cardSizes).x,
      y: toInt(child.tree_y, 0),
    }));
    const busMinX = Math.min(parentX, ...childCenters.map((item) => item.x));
    const busMaxX = Math.max(parentX, ...childCenters.map((item) => item.x));
    const firstChildY = Math.min(...childCenters.map((item) => item.y));
    const familyKey = `${toInt(lineParent.generation, 1)}:${Number(family.id)}`;
    const sourceTier = branchTierByFamily.get(familyKey) || 0;
    const minBranchY = parentBottomY + 38;
    const maxBranchY = Math.max(minBranchY, firstChildY - 32);
    const naturalBaseY = Math.round(Math.min(Math.max(minBranchY, firstChildY - 72) + sourceTier * SOURCE_BRANCH_STEP, maxBranchY));
    const savedBaseY = Number(lineRoutes?.[familyId]?.baseY);
    const baseY = snap(clamp(Number.isFinite(savedBaseY) ? savedBaseY : naturalBaseY, minBranchY, maxBranchY));
    const colorIndex = colorIndexByFamily.get(familyKey) || 0;
    const color = BLOOD_LINE_COLORS[colorIndex % BLOOD_LINE_COLORS.length];
    const lineId = `family-${familyId}`;

    const bloodDragMeta = { familyId, routeKey: "baseY", dragAxis: "y", minY: minBranchY, maxY: maxBranchY };
    lines.push({ id: `${lineId}-parent`, ...bloodDragMeta, type: "blood", color, d: `M ${parentX} ${parentBottomY} V ${baseY}` });
    lines.push({ id: `${lineId}-bus`, ...bloodDragMeta, type: "blood", color, d: `M ${busMinX} ${baseY} H ${busMaxX}` });
    childCenters.forEach((child) => {
      lines.push({ id: `${lineId}-child-${child.x}`, ...bloodDragMeta, type: "blood", color, d: `M ${child.x} ${baseY} V ${child.y}` });
    });

    lines.push({
      id: `${lineId}-control`,
      familyId,
      routeKey: "baseY",
      dragAxis: "y",
      type: "route-control",
      color,
      x: (busMinX + busMaxX) / 2,
      y: baseY,
      minY: minBranchY,
      maxY: maxBranchY,
    });
  });

  return lines;
}

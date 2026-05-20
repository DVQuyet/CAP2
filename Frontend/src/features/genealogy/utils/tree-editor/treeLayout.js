import { CANVAS_PADDING, CARD_WIDTH, FAMILY_GAP, LEVEL_HEIGHT, SIBLING_GAP, SPOUSE_GAP, X_GAP, Y_GAP } from "./treeConstants";
import { asArray, birthTime, normalizePerson, personSort, siblingSort, snap, toInt } from "./treePersonUtils";

export function findFounderIds(people, families, childRows) {
  const peopleIds = new Set(asArray(people).map((person) => Number(person.id)));
  const childIds = new Set(asArray(childRows).map((row) => Number(row.person_id)).filter((id) => peopleIds.has(id)));
  const roots = asArray(people).filter((person) => !childIds.has(Number(person.id)));
  const candidates = roots.length ? roots : asArray(people);
  if (!candidates.length) return new Set();
  const minGeneration = Math.min(...candidates.map((person) => toInt(person.generation, 1)));
  return new Set(candidates.filter((person) => toInt(person.generation, 1) === minGeneration).map((person) => Number(person.id)));
}

export function generationY(generation) {
  return snap(CANVAS_PADDING + Math.max(0, toInt(generation, 1) - 1) * LEVEL_HEIGHT);
}

export function simpleGenerationLayout(sourcePeople) {
  const people = asArray(sourcePeople).map(normalizePerson);
  const grouped = new Map();

  people
    .slice()
    .sort((a, b) => {
      const genDiff = toInt(a.generation, 1) - toInt(b.generation, 1);
      if (genDiff) return genDiff;
      const orderDiff = toInt(a.display_order, 0) - toInt(b.display_order, 0);
      if (orderDiff) return orderDiff;
      return a.id - b.id;
    })
    .forEach((person) => {
      const generation = toInt(person.generation, 1) || 1;
      if (!grouped.has(generation)) grouped.set(generation, []);
      grouped.get(generation).push(person);
    });

  const generations = [...grouped.keys()].sort((a, b) => a - b);
  const maxRowWidth = Math.max(
    1,
    ...generations.map((gen) => grouped.get(gen).length * CARD_WIDTH + Math.max(0, grouped.get(gen).length - 1) * X_GAP),
  );

  return people.map((person) => {
    const generation = toInt(person.generation, 1) || 1;
    const row = grouped.get(generation) || [];
    const index = row.findIndex((item) => item.id === person.id);
    const rowWidth = row.length * CARD_WIDTH + Math.max(0, row.length - 1) * X_GAP;
    const x = CANVAS_PADDING + Math.max(0, (maxRowWidth - rowWidth) / 2) + Math.max(0, index) * (CARD_WIDTH + X_GAP);
    const y = CANVAS_PADDING + Math.max(0, generation - 1) * Y_GAP;

    return {
      ...person,
      tree_x: snap(x),
      tree_y: snap(y),
      display_order: Math.max(0, index),
    };
  });
}

export function autoLayoutPeople(sourcePeople, families = [], childRows = []) {
  const people = asArray(sourcePeople).map(normalizePerson);
  if (!people.length) return [];

  const peopleMap = new Map(people.map((person) => [Number(person.id), person]));
  const familyRows = asArray(families).filter((family) => Number(family.id));
  if (!familyRows.length) return simpleGenerationLayout(people);

  const childrenByFamily = new Map();
  const childIds = new Set();
  asArray(childRows).forEach((row) => {
    const familyId = Number(row.family_id);
    const childId = Number(row.person_id);
    if (!peopleMap.has(childId) || !Number.isFinite(familyId)) return;
    if (!childrenByFamily.has(familyId)) childrenByFamily.set(familyId, []);
    childrenByFamily.get(familyId).push({
      person_id: childId,
      sort_order: toInt(row.sort_order, 0),
    });
    childIds.add(childId);
  });

  const familyByParentId = new Map();
  familyRows.forEach((family) => {
    [family.father_id, family.mother_id].forEach((id) => {
      const parentId = Number(id);
      if (peopleMap.has(parentId) && !familyByParentId.has(parentId)) {
        familyByParentId.set(parentId, family);
      }
    });
  });

  const mergePositionMaps = (target, source, offsetX = 0) => {
    source.forEach((position, id) => {
      target.set(id, { ...position, x: position.x + offsetX });
    });
  };

  const layoutSingle = (person) => ({
    width: CARD_WIDTH,
    positions: new Map([[Number(person.id), { x: 0, y: generationY(person.generation) }]]),
  });

  const layoutFamily = (family, visitedFamilies = new Set()) => {
    const familyId = Number(family.id);
    if (visitedFamilies.has(familyId)) {
      const parent = peopleMap.get(Number(family.father_id)) || peopleMap.get(Number(family.mother_id));
      return parent ? layoutSingle(parent) : { width: CARD_WIDTH, positions: new Map() };
    }

    const nextVisited = new Set(visitedFamilies);
    nextVisited.add(familyId);

    const parents = [peopleMap.get(Number(family.father_id)), peopleMap.get(Number(family.mother_id))]
      .filter(Boolean);
    const children = asArray(childrenByFamily.get(familyId))
      .map((row) => ({
        ...row,
        person: peopleMap.get(Number(row.person_id)),
      }))
      .filter((row) => row.person)
      .sort(siblingSort)
      .map((row) => row.person);

    const childUnits = children.map((child) => {
      const childFamily = familyByParentId.get(Number(child.id));
      return childFamily ? layoutFamily(childFamily, nextVisited) : layoutSingle(child);
    });
    const childrenWidth = childUnits.length
      ? childUnits.reduce((sum, unit) => sum + unit.width, 0) + Math.max(0, childUnits.length - 1) * SIBLING_GAP
      : 0;
    const parentWidth = parents.length
      ? parents.length * CARD_WIDTH + Math.max(0, parents.length - 1) * SPOUSE_GAP
      : CARD_WIDTH;
    const width = Math.max(parentWidth, childrenWidth, CARD_WIDTH);
    const positions = new Map();

    const parentStartX = (width - parentWidth) / 2;
    parents.forEach((parent, index) => {
      positions.set(Number(parent.id), {
        x: parentStartX + index * (CARD_WIDTH + SPOUSE_GAP),
        y: generationY(parent.generation),
      });
    });

    let childX = (width - childrenWidth) / 2;
    childUnits.forEach((unit) => {
      mergePositionMaps(positions, unit.positions, childX);
      childX += unit.width + SIBLING_GAP;
    });

    return { width, positions };
  };

  const rootFamilies = familyRows
    .filter((family) => {
      const parentIds = [Number(family.father_id), Number(family.mother_id)].filter((id) => peopleMap.has(id));
      return parentIds.length && parentIds.every((id) => !childIds.has(id));
    })
    .sort((a, b) => {
      const aParent = peopleMap.get(Number(a.father_id)) || peopleMap.get(Number(a.mother_id));
      const bParent = peopleMap.get(Number(b.father_id)) || peopleMap.get(Number(b.mother_id));
      return toInt(aParent?.generation, 1) - toInt(bParent?.generation, 1) || personSort(aParent || {}, bParent || {});
    });

  const positioned = new Map();
  let cursorX = CANVAS_PADDING;
  rootFamilies.forEach((family) => {
    const unit = layoutFamily(family);
    mergePositionMaps(positioned, unit.positions, cursorX);
    cursorX += unit.width + FAMILY_GAP;
  });

  const placedIds = new Set(positioned.keys());
  const leftovers = people.filter((person) => !placedIds.has(Number(person.id)));
  if (leftovers.length) {
    simpleGenerationLayout(leftovers).forEach((person) => {
      positioned.set(Number(person.id), {
        x: person.tree_x + Math.max(0, cursorX - CANVAS_PADDING),
        y: person.tree_y,
      });
    });
  }

  const laidOut = people.map((person) => {
    const position = positioned.get(Number(person.id));
    return {
      ...person,
      tree_x: snap(position?.x ?? person.tree_x),
      tree_y: snap(position?.y ?? generationY(person.generation)),
    };
  });

  return normalizeGenerationSpacing(assignDisplayOrder(laidOut), familyRows);
}

export function hasManualLayout(people) {
  return asArray(people).some((person) => toInt(person.tree_x, 0) !== 0 || toInt(person.tree_y, 0) !== 0);
}

export function assignDisplayOrder(people) {
  const grouped = new Map();
  people.forEach((person) => {
    const generation = toInt(person.generation, 1) || 1;
    if (!grouped.has(generation)) grouped.set(generation, []);
    grouped.get(generation).push(person);
  });

  const orderById = new Map();
  grouped.forEach((members) => {
    members
      .slice()
      .sort((a, b) => a.tree_x - b.tree_x || a.tree_y - b.tree_y || a.id - b.id)
      .forEach((person, index) => orderById.set(person.id, index));
  });

  return people.map((person) => ({ ...person, display_order: orderById.get(person.id) ?? person.display_order ?? 0 }));
}

export function getSpouseAwareGenerationUnits(row, families = []) {
  const members = asArray(row).slice();
  const personById = new Map(members.map((person) => [Number(person.id), person]));
  const used = new Set();
  const units = [];

  asArray(families).forEach((family) => {
    const father = personById.get(Number(family.father_id));
    const mother = personById.get(Number(family.mother_id));
    if (!father || !mother) return;
    if (used.has(Number(father.id)) || used.has(Number(mother.id))) return;

    const fatherGeneration = toInt(father.generation, 1) || 1;
    const motherGeneration = toInt(mother.generation, 1) || 1;
    if (fatherGeneration !== motherGeneration) return;

    used.add(Number(father.id));
    used.add(Number(mother.id));
    units.push({
      members: [mother, father],
      x: Math.min(toInt(father.tree_x, 0), toInt(mother.tree_x, 0)),
      sortPerson: mother,
      isSpouseUnit: true,
    });
  });

  members.forEach((person) => {
    if (used.has(Number(person.id))) return;
    units.push({
      members: [person],
      x: toInt(person.tree_x, 0),
      sortPerson: person,
      isSpouseUnit: false,
    });
  });

  return units.sort((a, b) => a.x - b.x || personSort(a.sortPerson || {}, b.sortPerson || {}));
}

export function getSpouseAwareGenerationRow(row, families = []) {
  return getSpouseAwareGenerationUnits(row, families).flatMap((unit) => unit.members);
}

export function getGenerationUnitWidth(unit) {
  const members = asArray(unit?.members);
  if (!members.length) return 0;
  const innerGap = unit?.isSpouseUnit ? SPOUSE_GAP : X_GAP;
  return members.length * CARD_WIDTH + Math.max(0, members.length - 1) * innerGap;
}

export function getGenerationUnitsWidth(units) {
  const safeUnits = asArray(units);
  if (!safeUnits.length) return CARD_WIDTH;
  return safeUnits.reduce((sum, unit) => sum + getGenerationUnitWidth(unit), 0) + Math.max(0, safeUnits.length - 1) * X_GAP;
}

export function normalizeGenerationSpacing(people, families = []) {
  const grouped = new Map();
  asArray(people).forEach((person) => {
    const generation = toInt(person.generation, 1) || 1;
    if (!grouped.has(generation)) grouped.set(generation, []);
    grouped.get(generation).push(person);
  });

  const generations = [...grouped.keys()].sort((a, b) => a - b);
  const orderedUnits = new Map();

  generations.forEach((generation) => {
    const row = (grouped.get(generation) || [])
      .slice()
      .sort((a, b) => toInt(a.tree_x, 0) - toInt(b.tree_x, 0) || personSort(a, b));
    orderedUnits.set(generation, getSpouseAwareGenerationUnits(row, families));
  });

  const maxRowWidth = Math.max(
    CARD_WIDTH,
    ...generations.map((generation) => getGenerationUnitsWidth(orderedUnits.get(generation) || [])),
  );

  const positioned = [];
  generations.forEach((generation) => {
    const units = orderedUnits.get(generation) || [];
    const rowWidth = getGenerationUnitsWidth(units);
    let cursorX = CANVAS_PADDING + Math.max(0, (maxRowWidth - rowWidth) / 2);
    let displayOrder = 0;

    units.forEach((unit) => {
      const innerGap = unit.isSpouseUnit ? SPOUSE_GAP : X_GAP;
      unit.members.forEach((person, memberIndex) => {
        positioned.push({
          ...person,
          tree_x: snap(cursorX + memberIndex * (CARD_WIDTH + innerGap)),
          tree_y: generationY(generation),
          display_order: displayOrder,
        });
        displayOrder += 1;
      });
      cursorX += getGenerationUnitWidth(unit) + X_GAP;
    });
  });

  return positioned.sort((a, b) => toInt(a.generation, 1) - toInt(b.generation, 1) || personSort(a, b));
}

export function mergeManualAndAutoLayout(sourcePeople, families = [], childRows = []) {
  const normalized = asArray(sourcePeople).map(normalizePerson);
  if (!normalized.length) return [];

  const hasAnyManualPosition = hasManualLayout(normalized);
  if (!hasAnyManualPosition) {
    return autoLayoutPeople(normalized, families, childRows);
  }

  const autoPeopleById = new Map(autoLayoutPeople(normalized, families, childRows).map((person) => [Number(person.id), person]));
  const merged = normalized.map((person) => {
    const hasManualPosition = toInt(person.tree_x, 0) !== 0 || toInt(person.tree_y, 0) !== 0;
    if (hasManualPosition) return person;
    const autoPerson = autoPeopleById.get(Number(person.id));
    return autoPerson ? { ...person, tree_x: autoPerson.tree_x, tree_y: autoPerson.tree_y, display_order: autoPerson.display_order } : person;
  });

  return assignDisplayOrder(merged);
}

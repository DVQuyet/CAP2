const asArray = (value) => (Array.isArray(value) ? value : []);

const toId = (value) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
};

export function buildFamilyIndexes(people = [], families = [], childRows = []) {
  const peopleById = new Map(asArray(people).map((person) => [Number(person.id), person]));
  const familiesById = new Map(asArray(families).map((family) => [Number(family.id), family]));
  const childFamilyByPersonId = new Map();
  const childrenByParentId = new Map();
  const spousesByPersonId = new Map();
  const parentsByChildId = new Map();

  asArray(childRows).forEach((row) => {
    const family = familiesById.get(Number(row.family_id));
    const childId = toId(row.person_id);
    if (!family || !childId || !peopleById.has(childId)) return;
    childFamilyByPersonId.set(childId, family);
    parentsByChildId.set(childId, [toId(family.father_id), toId(family.mother_id)].filter(Boolean));

    [toId(family.father_id), toId(family.mother_id)].filter(Boolean).forEach((parentId) => {
      if (!childrenByParentId.has(parentId)) childrenByParentId.set(parentId, new Set());
      childrenByParentId.get(parentId).add(childId);
    });
  });

  asArray(families).forEach((family) => {
    const fatherId = toId(family.father_id);
    const motherId = toId(family.mother_id);
    if (!fatherId || !motherId) return;
    if (!spousesByPersonId.has(fatherId)) spousesByPersonId.set(fatherId, new Set());
    if (!spousesByPersonId.has(motherId)) spousesByPersonId.set(motherId, new Set());
    spousesByPersonId.get(fatherId).add(motherId);
    spousesByPersonId.get(motherId).add(fatherId);
  });

  return { peopleById, familiesById, childFamilyByPersonId, childrenByParentId, spousesByPersonId, parentsByChildId };
}

export function getAncestorIds(personId, indexes, visited = new Set()) {
  const id = toId(personId);
  if (!id || visited.has(id)) return new Set();
  visited.add(id);
  const result = new Set();
  asArray(indexes.parentsByChildId.get(id)).forEach((parentId) => {
    result.add(parentId);
    getAncestorIds(parentId, indexes, visited).forEach((ancestorId) => result.add(ancestorId));
  });
  return result;
}

export function getDescendantIds(personId, indexes, visited = new Set()) {
  const id = toId(personId);
  if (!id || visited.has(id)) return new Set();
  visited.add(id);
  const result = new Set();
  const children = indexes.childrenByParentId.get(id) || new Set();
  children.forEach((childId) => {
    result.add(childId);
    getDescendantIds(childId, indexes, visited).forEach((descendantId) => result.add(descendantId));
  });
  return result;
}

export function getRelatedRootViewIds(rootPersonId, people = [], families = [], childRows = []) {
  const indexes = buildFamilyIndexes(people, families, childRows);
  const rootId = toId(rootPersonId);
  if (!rootId || !indexes.peopleById.has(rootId)) return new Set(asArray(people).map((person) => Number(person.id)));

  const ids = new Set([rootId]);
  getAncestorIds(rootId, indexes).forEach((id) => ids.add(id));
  getDescendantIds(rootId, indexes).forEach((id) => ids.add(id));

  Array.from(ids).forEach((id) => {
    const spouses = indexes.spousesByPersonId.get(id) || new Set();
    spouses.forEach((spouseId) => ids.add(spouseId));
  });

  return ids;
}

export function getHiddenDescendantIds(collapsedIds = [], people = [], families = [], childRows = []) {
  const indexes = buildFamilyIndexes(people, families, childRows);
  const hidden = new Set();
  asArray(collapsedIds).forEach((id) => {
    getDescendantIds(id, indexes).forEach((descendantId) => hidden.add(descendantId));
  });
  Array.from(hidden).forEach((id) => {
    const spouses = indexes.spousesByPersonId.get(Number(id)) || new Set();
    spouses.forEach((spouseId) => hidden.add(Number(spouseId)));
  });
  return hidden;
}

export function getAncestorPathIds(personId, people = [], families = [], childRows = []) {
  const indexes = buildFamilyIndexes(people, families, childRows);
  return getAncestorIds(personId, indexes);
}

export function filterTreeData(people = [], families = [], childRows = [], visibleIds = new Set()) {
  const ids = visibleIds instanceof Set ? visibleIds : new Set(asArray(visibleIds).map(Number));
  const visiblePeople = asArray(people).filter((person) => ids.has(Number(person.id)));
  const visibleFamilies = asArray(families).filter((family) => {
    const fatherId = toId(family.father_id);
    const motherId = toId(family.mother_id);
    return (!fatherId || ids.has(fatherId)) && (!motherId || ids.has(motherId)) && (fatherId || motherId);
  });
  const familyIds = new Set(visibleFamilies.map((family) => Number(family.id)));
  const visibleChildRows = asArray(childRows).filter((row) => familyIds.has(Number(row.family_id)) && ids.has(Number(row.person_id)));
  return { people: visiblePeople, families: visibleFamilies, childRows: visibleChildRows };
}

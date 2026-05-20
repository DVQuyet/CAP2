import { asArray, normalizePerson, personIdentityKey, personSort, toInt } from "./treePersonUtils";

export function dedupePeopleByAccount(sourcePeople) {
  const normalized = asArray(sourcePeople).map(normalizePerson).filter((person) => Number.isFinite(person.id));
  const canonicalByKey = new Map();

  normalized
    .slice()
    .sort((a, b) => {
      const manualA = toInt(a.tree_x, 0) !== 0 || toInt(a.tree_y, 0) !== 0 ? 0 : 1;
      const manualB = toInt(b.tree_x, 0) !== 0 || toInt(b.tree_y, 0) !== 0 ? 0 : 1;
      if (manualA !== manualB) return manualA - manualB;
      return personSort(a, b);
    })
    .forEach((person) => {
      const key = personIdentityKey(person);
      if (!canonicalByKey.has(key)) canonicalByKey.set(key, person);
    });

  const idMap = new Map();
  normalized.forEach((person) => {
    const canonical = canonicalByKey.get(personIdentityKey(person));
    idMap.set(Number(person.id), Number(canonical?.id || person.id));
  });

  const uniqueByPersonId = new Map();
  [...canonicalByKey.values()].sort(personSort).forEach((person) => {
    if (!uniqueByPersonId.has(Number(person.id))) uniqueByPersonId.set(Number(person.id), person);
  });

  return {
    people: [...uniqueByPersonId.values()],
    idMap,
  };
}

export function remapFamiliesByPeople(families, idMap, people) {
  const peopleIds = new Set(asArray(people).map((person) => Number(person.id)));
  const seen = new Map();
  const familyIdMap = new Map();
  const remapped = [];

  asArray(families)
    .map((family) => ({
      ...family,
      father_id: family.father_id == null ? null : idMap.get(Number(family.father_id)) ?? Number(family.father_id),
      mother_id: family.mother_id == null ? null : idMap.get(Number(family.mother_id)) ?? Number(family.mother_id),
    }))
    .filter((family) => family.father_id || family.mother_id)
    .filter((family) => {
      if (family.father_id && !peopleIds.has(Number(family.father_id))) return false;
      if (family.mother_id && !peopleIds.has(Number(family.mother_id))) return false;
      const key = `${Number(family.father_id) || "null"}:${Number(family.mother_id) || "null"}`;
      const existingFamilyId = seen.get(key);
      if (existingFamilyId) {
        familyIdMap.set(Number(family.id), existingFamilyId);
        return false;
      }
      seen.set(key, Number(family.id));
      familyIdMap.set(Number(family.id), Number(family.id));
      remapped.push(family);
      return true;
    });

  return { families: remapped, familyIdMap };
}

export function remapChildrenByPeople(childRows, idMap, familyIdMap, families, people) {
  const peopleIds = new Set(asArray(people).map((person) => Number(person.id)));
  const familyIds = new Set(asArray(families).map((family) => Number(family.id)));
  const seen = new Set();
  return asArray(childRows)
    .map((row) => ({
      ...row,
      family_id: familyIdMap.get(Number(row.family_id)) ?? Number(row.family_id),
      person_id: idMap.get(Number(row.person_id)) ?? Number(row.person_id),
    }))
    .filter((row) => familyIds.has(Number(row.family_id)) && peopleIds.has(Number(row.person_id)))
    .filter((row) => {
      const key = `${Number(row.family_id)}:${Number(row.person_id)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

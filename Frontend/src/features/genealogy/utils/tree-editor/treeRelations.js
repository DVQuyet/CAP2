import { CANVAS_PADDING, CARD_WIDTH, X_GAP, Y_GAP } from "./treeConstants";
import { asArray, fullName, personSort, toInt } from "./treePersonUtils";

export function findParentFamilyForChild(personId, families, childRows) {
  const child = asArray(childRows).find((row) => Number(row.person_id) === Number(personId));
  if (!child) return null;
  return asArray(families).find((family) => Number(family.id) === Number(child.family_id)) || null;
}

export function findFamilyForParent(personId, families) {
  return getFamiliesForPerson(personId, families)[0] || null;
}

export function getFamiliesForPerson(personId, families) {
  const id = Number(personId);
  if (!Number.isFinite(id) || id <= 0) return [];
  return asArray(families).filter(
    (family) => Number(family.father_id) === Number(personId) || Number(family.mother_id) === Number(personId),
  );
}

export function findSpouseFamily(personId, spouseId, families) {
  const person = Number(personId);
  const spouse = Number(spouseId);
  if (!Number.isFinite(person) || !Number.isFinite(spouse) || person <= 0 || spouse <= 0) return null;
  return asArray(families).find((family) => {
    const fatherId = Number(family.father_id);
    const motherId = Number(family.mother_id);
    return (
      (fatherId === person && motherId === spouse) ||
      (fatherId === spouse && motherId === person)
    );
  }) || null;
}

export function isPersonLiving(personId, people = []) {
  const person = asArray(people).find((item) => Number(item.id) === Number(personId));
  if (!person) return true;
  return Number(person.is_living) !== 0 && !person.death_date;
}

export function isActiveFamilyForPerson(family, personId, people = []) {
  const id = Number(personId);
  const spouseId = Number(family?.father_id) === id ? Number(family?.mother_id) : Number(family?.father_id);
  return (
    Number.isFinite(spouseId) &&
    spouseId > 0 &&
    String(family?.relationship_status || "active") === "active" &&
    isPersonLiving(spouseId, people)
  );
}

export function getActiveFamiliesForPerson(personId, families, people = []) {
  return getFamiliesForPerson(personId, families).filter((family) => isActiveFamilyForPerson(family, personId, people));
}

export function getSpousesForPerson(personId, families, people = []) {
  return getFamiliesForPerson(personId, families)
    .map((family) => {
      const id = Number(personId);
      const spouseId = Number(family.father_id) === id ? Number(family.mother_id) : Number(family.father_id);
      return asArray(people).find((person) => Number(person.id) === spouseId) || null;
    })
    .filter(Boolean);
}

export function getChildrenForFamily(familyId, childRows) {
  return asArray(childRows)
    .filter((row) => Number(row.family_id) === Number(familyId))
    .map((row) => Number(row.person_id))
    .filter((id) => Number.isFinite(id) && id > 0);
}

export function getPreferredChildFamilyForParent(parentId, families, people = []) {
  const parentFamilies = getFamiliesForPerson(parentId, families);
  if (!parentFamilies.length) return { family: null };
  if (parentFamilies.length === 1) return { family: parentFamilies[0] };

  const activeFamilies = parentFamilies.filter((family) => isActiveFamilyForPerson(family, parentId, people));
  if (activeFamilies.length === 1) return { family: activeFamilies[0] };

  const spouseFamilies = parentFamilies.filter((family) => {
    const id = Number(parentId);
    const spouseId = Number(family.father_id) === id ? Number(family.mother_id) : Number(family.father_id);
    return Number.isFinite(spouseId) && spouseId > 0 && String(family.relationship_status || "active") === "active";
  });
  if (spouseFamilies.length === 1) return { family: spouseFamilies[0] };

  return { family: null, error: "multipleFamilies" };
}

export function buildChildRelationPayload(parentId, childId, families, childRows, people = []) {
  const sourceId = Number(parentId);
  const targetId = Number(childId);
  const { family, error } = getPreferredChildFamilyForParent(sourceId, families, people);
  if (error) return { error };

  const existingChildren = family ? getChildrenForFamily(family.id, childRows) : [];
  const childrenIds = Array.from(new Set([...existingChildren, targetId])).filter(
    (id) => Number(id) !== sourceId,
  );

  return {
    data: {
      person_id: sourceId,
      ...(family ? { family_id: family.id } : {}),
      children_person_ids: childrenIds,
    },
  };
}

export function findSpouse(person, families, people) {
  if (!person) return null;
  const family = getActiveFamiliesForPerson(person.id, families, people)[0] || findFamilyForParent(person.id, families);
  if (!family) return null;
  const spouseId = Number(family.father_id) === Number(person.id) ? Number(family.mother_id) : Number(family.father_id);
  return people.find((item) => Number(item.id) === spouseId) || null;
}

export function spouseIdsForPerson(personId, families) {
  const id = Number(personId);
  if (!Number.isFinite(id) || id <= 0) return [];
  return asArray(families)
    .filter((family) => Number(family.father_id) === id || Number(family.mother_id) === id)
    .map((family) => (Number(family.father_id) === id ? Number(family.mother_id) : Number(family.father_id)))
    .filter((spouseId) => Number.isFinite(spouseId) && spouseId > 0);
}

export function hasDifferentSpouse(personId, allowedSpouseId, families, people = []) {
  const allowed = Number(allowedSpouseId);
  return getActiveFamiliesForPerson(personId, families, people).some((family) => {
    const id = Number(personId);
    const spouseId = Number(family.father_id) === id ? Number(family.mother_id) : Number(family.father_id);
    return Number(spouseId) !== allowed;
  });
}

export const relationLabels = {
  spouse: "tree.relations.spouse",
  child: "tree.relations.child",
  father: "tree.relations.father",
  mother: "tree.relations.mother",
};

export function relationCandidates(relation, selectedPerson, people, linkedIds = new Set(), families = []) {
  const selectedGeneration = toInt(selectedPerson?.generation, 1) || 1;
  const selectedId = Number(selectedPerson?.id);
  return asArray(people)
    .filter((person) => Number(person.id) !== selectedId)
    .filter((person) => {
      const personId = Number(person.id);
      if (linkedIds.has(personId)) return true;
      if (relation === "father") return Number(person.gender) !== 2;
      if (relation === "mother") return Number(person.gender) !== 1;
      if (relation === "spouse") {
        const sameGeneration = !selectedPerson?.generation || !person.generation || Number(person.generation) === Number(selectedPerson.generation);
        const oppositeGender = !selectedPerson?.gender || !person.gender || Number(person.gender) !== Number(selectedPerson.gender);
        const selectedAvailable = !hasDifferentSpouse(selectedId, personId, families, people);
        const candidateAvailable = !hasDifferentSpouse(personId, selectedId, families, people);
        return sameGeneration && oppositeGender && selectedAvailable && candidateAvailable;
      }
      return true;
    })
    .sort((a, b) => {
      const linkedDiff = Number(linkedIds.has(Number(b.id))) - Number(linkedIds.has(Number(a.id)));
      if (linkedDiff) return linkedDiff;
      if (relation === "father" || relation === "mother") {
        const genDiff = Math.abs(toInt(a.generation, 1) - Math.max(1, selectedGeneration - 1)) -
          Math.abs(toInt(b.generation, 1) - Math.max(1, selectedGeneration - 1));
        if (genDiff) return genDiff;
      }
      if (relation === "child") {
        const genDiff = Math.abs(toInt(a.generation, 1) - (selectedGeneration + 1)) -
          Math.abs(toInt(b.generation, 1) - (selectedGeneration + 1));
        if (genDiff) return genDiff;
      }
      return personSort(a, b);
    });
}

export function relationLinkedIds(relation, selectedPerson, families, childRows) {
  if (!selectedPerson) return new Set();
  const selectedId = Number(selectedPerson.id);

  if (relation === "father" || relation === "mother") {
    const family = findParentFamilyForChild(selectedId, families, childRows);
    const id = relation === "father" ? Number(family?.father_id) : Number(family?.mother_id);
    return Number.isFinite(id) && id > 0 ? new Set([id]) : new Set();
  }

  if (relation === "spouse") {
    return new Set(spouseIdsForPerson(selectedId, families));
  }

  if (relation === "child") {
    const familyIds = new Set(getFamiliesForPerson(selectedId, families).map((family) => Number(family.id)));
    if (!familyIds.size) return new Set();
    return new Set(
      asArray(childRows)
        .filter((row) => familyIds.has(Number(row.family_id)))
        .map((row) => Number(row.person_id))
        .filter((id) => Number.isFinite(id) && id > 0),
    );
  }

  return new Set();
}

export function blankCreateForm(relation, selectedPerson, spouse) {
  const selectedGeneration = toInt(selectedPerson?.generation, 1) || 1;
  const selectedX = toInt(selectedPerson?.tree_x, CANVAS_PADDING);
  const selectedY = toInt(selectedPerson?.tree_y, CANVAS_PADDING);
  const relationGender =
    relation === "spouse"
      ? Number(selectedPerson?.gender) === 1
        ? "2"
        : "1"
      : relation === "mother"
        ? "2"
        : "1";
  const generation =
    relation === "child"
      ? selectedGeneration + 1
      : relation === "father" || relation === "mother"
        ? Math.max(1, selectedGeneration - 1)
        : selectedGeneration;
  const x =
    relation === "spouse"
      ? selectedX + CARD_WIDTH + X_GAP
      : relation === "child"
        ? selectedX
        : relation === "father" || relation === "mother"
          ? selectedX + (relation === "mother" ? CARD_WIDTH + X_GAP : 0)
          : CANVAS_PADDING;
  const y =
    relation === "child"
      ? selectedY + Y_GAP
      : relation === "father" || relation === "mother"
        ? Math.max(80, selectedY - Y_GAP)
        : relation === "spouse"
          ? selectedY
          : CANVAS_PADDING;

  return {
  display_name: "",
  surname: selectedPerson?.surname || spouse?.surname || "",
  middle_name: "",
  first_name: "",
  gender: relationGender,
  birth_date: "",
  death_date: "",
  is_living: "1",
  generation: String(generation),
  branch: selectedPerson?.branch != null ? String(selectedPerson.branch) : "",
  hometown: selectedPerson?.hometown || "",
  avatar_url: "",
  bio: "",
  note: "",
  tree_x: String(Math.round(x)),
  tree_y: String(Math.round(y)),

  account_email: "",
  account_password: "",
};
}

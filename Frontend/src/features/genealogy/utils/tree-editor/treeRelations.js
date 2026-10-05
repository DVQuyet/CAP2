import { CANVAS_PADDING, CARD_WIDTH, X_GAP, Y_GAP } from "./treeConstants";
import { asArray, fullName, personSort, toInt } from "./treePersonUtils";

export function findParentFamilyForChild(personId, families, childRows) {
  const rows = asArray(childRows).filter((row) => Number(row.person_id) === Number(personId));
  const child = rows.find((row) => ["biological", "unknown", ""].includes(String(row.child_type || "biological"))) || rows[0];
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

export function getChildOrderMapForFamily(familyId, childRows) {
  const map = {};
  asArray(childRows)
    .filter((row) => Number(row.family_id) === Number(familyId))
    .forEach((row, index) => {
      const personId = Number(row.person_id);
      if (!Number.isFinite(personId) || personId <= 0) return;
      const order = toInt(row.sort_order, index + 1);
      map[personId] = order > 0 ? order : index + 1;
    });
  return map;
}

export const CHILD_TYPE_OPTIONS = ["biological", "adopted", "heir", "step", "foster", "unknown"];
export const PARENT_LINK_TYPE_OPTIONS = ["biological", "adopted", "heir"];
export const UNION_TYPE_OPTIONS = ["marriage", "concubine", "cohabitation", "unknown"];
export const RELATIONSHIP_STATUS_OPTIONS = ["active", "widowed", "divorced", "separated", "annulled", "unknown"];

// Các cuộc hôn nhân của một người để chọn "con với ai". Luôn có lựa chọn "không rõ cha/mẹ còn lại".
export function getUnionOptionsForPerson(personId, families, people = []) {
  const id = Number(personId);
  const options = getFamiliesForPerson(id, families).map((family) => {
    const spouseId = Number(family.father_id) === id ? Number(family.mother_id) : Number(family.father_id);
    const spouse = Number.isFinite(spouseId) && spouseId > 0
      ? asArray(people).find((person) => Number(person.id) === spouseId) || null
      : null;
    const rank = Number(Number(family.father_id) === id ? family.wife_rank : family.husband_rank);
    return {
      key: `family:${Number(family.id)}`,
      familyId: Number(family.id),
      spouseId: spouse ? spouseId : null,
      spouse,
      status: String(family.relationship_status || "active"),
      unionType: String(family.union_type || "marriage"),
      rank: Number.isFinite(rank) && rank > 0 ? rank : null,
    };
  }).sort((a, b) => (a.rank || 99) - (b.rank || 99) || a.familyId - b.familyId);
  if (!options.some((option) => !option.spouseId)) {
    options.push({ key: "unknown", familyId: null, spouseId: null, spouse: null, status: "active", unionType: "unknown", rank: null });
  }
  return options;
}

// Chỉ chọn sẵn khi không thể nhầm: đúng một người vợ/chồng, hoặc chưa có vợ/chồng nào.
export function defaultUnionKey(options = []) {
  const withSpouse = options.filter((option) => option.spouseId);
  if (withSpouse.length === 1) return withSpouse[0].key;
  if (!withSpouse.length) return options.find((option) => !option.spouseId)?.key || "unknown";
  return "";
}

export function parentsForUnionChoice(sourcePerson, unionKey, families) {
  const familyId = String(unionKey || "").startsWith("family:") ? Number(String(unionKey).slice(7)) : null;
  if (familyId) {
    const family = asArray(families).find((item) => Number(item.id) === familyId);
    if (family) {
      return {
        fatherId: Number(family.father_id) > 0 ? Number(family.father_id) : null,
        motherId: Number(family.mother_id) > 0 ? Number(family.mother_id) : null,
        familyId,
      };
    }
  }
  const isFemale = Number(sourcePerson?.gender) === 2;
  return isFemale
    ? { fatherId: null, motherId: Number(sourcePerson?.id), familyId: null }
    : { fatherId: Number(sourcePerson?.id), motherId: null, familyId: null };
}

export function nextChildOrderForParents(parents, families, childRows) {
  const family = parents.familyId
    ? asArray(families).find((item) => Number(item.id) === Number(parents.familyId))
    : asArray(families).find((item) =>
      (Number(item.father_id) || null) === (parents.fatherId || null)
      && (Number(item.mother_id) || null) === (parents.motherId || null));
  if (!family) return 1;
  const orders = asArray(childRows)
    .filter((row) => Number(row.family_id) === Number(family.id))
    .map((row) => toInt(row.sort_order, 0));
  return orders.length ? Math.max(0, ...orders) + 1 : 1;
}

const currentParentLink = (personId, families, childRows, childType = "biological") => {
  const wanted = childType === "biological" ? ["biological", "unknown", ""] : [childType];
  const row = asArray(childRows).find((item) =>
    Number(item.person_id) === Number(personId) && wanted.includes(String(item.child_type || "biological")));
  if (!row) return null;
  return asArray(families).find((family) => Number(family.id) === Number(row.family_id)) || null;
};

// Payload liên kết một người ĐÃ CÓ trong cây theo quan hệ được chọn.
// options: { unionKey, childType, unionType, relationshipStatus, parentType }
export function buildLinkPayload(relation, sourcePerson, targetId, options = {}, families = [], childRows = []) {
  const sourceId = Number(sourcePerson?.id);
  const target = Number(targetId);
  if (relation === "spouse") {
    return {
      person_id: sourceId,
      spouse_person_id: target,
      union_type: options.unionType || "marriage",
      relationship_status: options.relationshipStatus || "active",
    };
  }
  if (relation === "child") {
    const parents = parentsForUnionChoice(sourcePerson, options.unionKey, families);
    return {
      person_id: target,
      parent_father_id: parents.fatherId,
      parent_mother_id: parents.motherId,
      parent_child_type: options.childType || "biological",
      sort_order: nextChildOrderForParents(parents, families, childRows),
    };
  }
  if (relation === "father" || relation === "mother") {
    const parentType = options.parentType || "biological";
    const current = currentParentLink(sourceId, families, childRows, parentType);
    return {
      person_id: sourceId,
      father_person_id: relation === "father" ? target : Number(current?.father_id) || null,
      mother_person_id: relation === "mother" ? target : Number(current?.mother_id) || null,
      parent_child_type: parentType,
    };
  }
  return null;
}

// Trường bổ sung khi TẠO MỚI một người theo quan hệ với người nguồn (server tạo người và quan hệ trong một transaction).
export function buildCreateRelationFields(relation, sourcePerson, options = {}, families = [], childRows = []) {
  const sourceId = Number(sourcePerson?.id);
  if (!sourceId || relation === "person") return {};
  if (relation === "child") {
    const parents = parentsForUnionChoice(sourcePerson, options.unionKey, families);
    return {
      parent_father_id: parents.fatherId,
      parent_mother_id: parents.motherId,
      parent_child_type: options.childType || "biological",
      sort_order: nextChildOrderForParents(parents, families, childRows),
    };
  }
  if (relation === "spouse") {
    return {
      relation: {
        type: "spouse",
        source_person_id: sourceId,
        union: {
          union_type: options.unionType || "marriage",
          relationship_status: options.relationshipStatus || "active",
        },
      },
    };
  }
  if (relation === "father" || relation === "mother") {
    return {
      relation: {
        type: relation,
        source_person_id: sourceId,
        child_type: options.parentType || "biological",
      },
    };
  }
  return {};
}

// Cha mẹ sẽ có của người con (để kiểm tra tuổi ở phía giao diện trước khi gửi).
export function otherParentForChildChoice(sourcePerson, unionKey, families, people = []) {
  const parents = parentsForUnionChoice(sourcePerson, unionKey, families);
  const otherId = Number(sourcePerson?.id) === parents.fatherId ? parents.motherId : parents.fatherId;
  return otherId ? asArray(people).find((person) => Number(person.id) === Number(otherId)) || null : null;
}

// Tương thích với luồng cũ của editor (chưa có hộp chọn "con với ai"): chỉ chọn sẵn khi không thể nhầm,
// nhiều cuộc hôn nhân thì trả lỗi để người dùng chọn.
export function buildChildRelationPayload(parentId, childId, families, childRows, people = [], options = {}) {
  const sourcePerson = asArray(people).find((person) => Number(person.id) === Number(parentId)) || { id: Number(parentId) };
  const unionKey = options.unionKey || defaultUnionKey(getUnionOptionsForPerson(parentId, families, people));
  if (!unionKey) return { error: "multipleFamilies" };
  const parents = parentsForUnionChoice(sourcePerson, unionKey, families);
  const family = parents.familyId ? asArray(families).find((item) => Number(item.id) === parents.familyId) : null;
  const existingChildren = family ? getChildrenForFamily(family.id, childRows) : [];
  const childOrders = family ? getChildOrderMapForFamily(family.id, childRows) : {};
  const targetId = Number(childId);
  const childrenIds = Array.from(new Set([...existingChildren, targetId])).filter((id) => id > 0 && id !== Number(parentId));
  childrenIds.forEach((id, index) => { if (!childOrders[id]) childOrders[id] = index + 1; });
  return {
    data: {
      person_id: Number(parentId),
      ...(family ? { family_id: family.id } : { spouse_person_id: null }),
      father_person_id: parents.fatherId,
      mother_person_id: parents.motherId,
      children_person_ids: childrenIds,
      child_orders: childOrders,
    },
  };
}

export function defaultRelationOptions(relation, sourcePerson, families, people) {
  if (relation === "child") {
    return {
      unionKey: defaultUnionKey(getUnionOptionsForPerson(sourcePerson?.id, families, people)),
      childType: "biological",
    };
  }
  if (relation === "spouse") return { unionType: "marriage", relationshipStatus: "active" };
  if (relation === "father" || relation === "mother") return { parentType: "biological" };
  return {};
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
        // Khác đời, đang có vợ/chồng... không bị loại ở đây: máy chủ kiểm tra theo luật và dữ liệu lịch sử
        // (ví dụ vợ lẽ trong gia phả xưa) rồi yêu cầu xác nhận khi cần.
        return !selectedPerson?.gender || !person.gender || Number(person.gender) !== Number(selectedPerson.gender);
      }
      return true;
    })
    .sort((a, b) => {
      const linkedDiff = Number(linkedIds.has(Number(b.id))) - Number(linkedIds.has(Number(a.id)));
      if (linkedDiff) return linkedDiff;
      if (relation === "spouse") {
        const genDiff = Math.abs(toInt(a.generation, 1) - selectedGeneration) - Math.abs(toInt(b.generation, 1) - selectedGeneration);
        if (genDiff) return genDiff;
        const busyDiff = Number(hasDifferentSpouse(Number(a.id), selectedId, families, people))
          - Number(hasDifferentSpouse(Number(b.id), selectedId, families, people));
        if (busyDiff) return busyDiff;
      }
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

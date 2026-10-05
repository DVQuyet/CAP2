// Mô hình hôn nhân dùng chung cho sắp xếp cây và vẽ cây:
// - Cụm vợ chồng: những người nối với nhau qua hôn nhân (một người có thể có nhiều vợ/chồng).
// - Mỗi người chỉ có MỘT vị trí chính trên cây (dưới gia đình dòng chính của người "neo" trong cụm).
// - Các liên kết cha mẹ - con còn lại (con nuôi/thừa tự với cha mẹ đẻ, con gái lấy chồng nhánh khác...)
//   được vẽ bằng thẻ tham chiếu dưới gia đình đó.
import { asArray, toInt } from "./treePersonUtils";

const MALE = 1;
const FEMALE = 2;
const ENDED_STATUSES = new Set(["divorced", "separated", "annulled"]);
const ADOPTIVE_TYPES = new Set(["adopted", "heir", "foster"]);

export const isEndedUnion = (family) => ENDED_STATUSES.has(String(family?.relationship_status || "active"));
export const isAdoptiveChildType = (type) => ADOPTIVE_TYPES.has(String(type || "").toLowerCase());
export const isStepChildType = (type) => String(type || "").toLowerCase() === "step";

const toId = (value) => {
  const id = Number(value);
  return Number.isFinite(id) && id > 0 ? id : null;
};

const childTypeOf = (row) => String(row?.child_type || "biological").toLowerCase();

function unionRankFor(family, personId) {
  const id = Number(personId);
  const rank = Number(family.father_id) === id ? family.wife_rank : family.husband_rank;
  const value = Number(rank);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function sortUnions(unions, personId) {
  return unions.slice().sort((a, b) => {
    const rankA = unionRankFor(a, personId);
    const rankB = unionRankFor(b, personId);
    if (rankA && rankB && rankA !== rankB) return rankA - rankB;
    if (rankA && !rankB) return -1;
    if (!rankA && rankB) return 1;
    const dateA = String(a.marriage_date || "");
    const dateB = String(b.marriage_date || "");
    if (dateA && dateB && dateA !== dateB) return dateA < dateB ? -1 : 1;
    return Number(a.id) - Number(b.id);
  });
}

export function buildUnionModel(people = [], families = [], childRows = [], options = {}) {
  const keepGender = options.lineage === "matrilineal" ? FEMALE : MALE;
  const peopleById = new Map(asArray(people).map((person) => [Number(person.id), person]));
  const familiesById = new Map();
  const unionsByPerson = new Map();
  asArray(families).forEach((family) => {
    const id = Number(family.id);
    if (!Number.isFinite(id)) return;
    const fatherId = peopleById.has(Number(family.father_id)) ? Number(family.father_id) : null;
    const motherId = peopleById.has(Number(family.mother_id)) ? Number(family.mother_id) : null;
    if (!fatherId && !motherId) return;
    const normalized = { ...family, id, father_id: fatherId, mother_id: motherId };
    familiesById.set(id, normalized);
    [fatherId, motherId].filter(Boolean).forEach((personId) => {
      if (!unionsByPerson.has(personId)) unionsByPerson.set(personId, []);
      unionsByPerson.get(personId).push(normalized);
    });
  });
  unionsByPerson.forEach((list, personId) => unionsByPerson.set(personId, sortUnions(list, personId)));

  const linksByPerson = new Map();
  const linksByFamily = new Map();
  asArray(childRows).forEach((row) => {
    const familyId = Number(row.family_id);
    const personId = Number(row.person_id);
    if (!familiesById.has(familyId) || !peopleById.has(personId)) return;
    const link = {
      familyId,
      personId,
      childType: childTypeOf(row),
      isPrimary: row.is_primary_lineage === undefined || row.is_primary_lineage === null ? null : Number(row.is_primary_lineage) === 1,
      sortOrder: toInt(row.sort_order, 0),
    };
    if (!linksByPerson.has(personId)) linksByPerson.set(personId, []);
    if (linksByPerson.get(personId).some((item) => item.familyId === familyId)) return;
    linksByPerson.get(personId).push(link);
    if (!linksByFamily.has(familyId)) linksByFamily.set(familyId, []);
    linksByFamily.get(familyId).push(link);
  });

  const primaryLinkOf = (personId) => {
    const links = linksByPerson.get(Number(personId)) || [];
    return links.find((link) => link.isPrimary === true)
      || links.find((link) => link.childType === "biological" || link.childType === "unknown")
      || links.find((link) => isAdoptiveChildType(link.childType))
      || links[0]
      || null;
  };

  const spouseIdsOf = (personId) => asArray(unionsByPerson.get(Number(personId)))
    .map((family) => (family.father_id === Number(personId) ? family.mother_id : family.father_id))
    .filter(Boolean);

  // Cụm vợ chồng.
  const clusterByPersonId = new Map();
  const clusters = [];
  peopleById.forEach((_, personId) => {
    if (clusterByPersonId.has(personId)) return;
    const members = [];
    const queue = [personId];
    const seen = new Set([personId]);
    while (queue.length) {
      const current = queue.shift();
      members.push(current);
      spouseIdsOf(current).forEach((spouseId) => {
        if (!seen.has(spouseId)) {
          seen.add(spouseId);
          queue.push(spouseId);
        }
      });
    }
    const familyIds = [...new Set(members.flatMap((memberId) => asArray(unionsByPerson.get(memberId)).map((family) => family.id)))];
    const coupleFamilies = familyIds.filter((id) => {
      const family = familiesById.get(id);
      return family.father_id && family.mother_id;
    });

    // Người neo: có cha mẹ trong cây (ưu tiên giới tính nối dòng), nếu không thì người có nhiều hôn nhân nhất.
    const withParents = members.filter((memberId) => primaryLinkOf(memberId));
    const anchorPool = withParents.length ? withParents : members;
    const anchorId = anchorPool.slice().sort((a, b) => {
      const genderA = Number(peopleById.get(a)?.gender) === keepGender ? 0 : 1;
      const genderB = Number(peopleById.get(b)?.gender) === keepGender ? 0 : 1;
      if (genderA !== genderB) return genderA - genderB;
      const unionDiff = asArray(unionsByPerson.get(b)).length - asArray(unionsByPerson.get(a)).length;
      if (unionDiff) return unionDiff;
      return a - b;
    })[0];

    const cluster = {
      id: `cluster_${anchorId}`,
      anchorId,
      memberIds: orderClusterMembers(anchorId, members, unionsByPerson),
      familyIds,
      coupleFamilyIds: coupleFamilies,
      homeFamilyId: primaryLinkOf(anchorId)?.familyId ?? null,
      exclusiveCouple: members.length === 2 && coupleFamilies.length === 1,
    };
    clusters.push(cluster);
    members.forEach((memberId) => clusterByPersonId.set(memberId, cluster));
  });

  const isHomeLink = (familyId, personId) => {
    const cluster = clusterByPersonId.get(Number(personId));
    if (!cluster) return true;
    return cluster.anchorId === Number(personId) && cluster.homeFamilyId === Number(familyId);
  };

  return {
    peopleById,
    familiesById,
    unionsByPerson,
    linksByPerson,
    linksByFamily,
    clusters,
    clusterByPersonId,
    primaryLinkOf,
    spouseIdsOf,
    isHomeLink,
  };
}

// Thứ tự trong cụm: người neo ở giữa, vợ/chồng thứ nhất bên phải, thứ hai bên trái, xen kẽ;
// vợ/chồng của những người đó đặt tiếp ra phía ngoài.
function orderClusterMembers(anchorId, members, unionsByPerson) {
  if (members.length <= 1) return members.slice();
  const left = [];
  const right = [];
  const placed = new Set([anchorId]);
  const spousesOf = (personId) => asArray(unionsByPerson.get(personId))
    .map((family) => (family.father_id === personId ? family.mother_id : family.father_id))
    .filter((id) => id && members.includes(id));

  const anchorSpouses = spousesOf(anchorId);
  const sides = new Map();
  anchorSpouses.forEach((spouseId, index) => {
    if (placed.has(spouseId)) return;
    placed.add(spouseId);
    const side = index % 2 === 0 ? right : left;
    side.push(spouseId);
    sides.set(spouseId, side);
  });
  const queue = [...anchorSpouses];
  while (queue.length) {
    const current = queue.shift();
    const side = sides.get(current) || right;
    spousesOf(current).forEach((spouseId) => {
      if (placed.has(spouseId)) return;
      placed.add(spouseId);
      side.push(spouseId);
      sides.set(spouseId, side);
      queue.push(spouseId);
    });
  }
  members.forEach((memberId) => {
    if (!placed.has(memberId)) right.push(memberId);
  });
  return [...left.reverse(), anchorId, ...right];
}

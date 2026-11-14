// Dựng thẻ từ vị trí từng người: cặp vợ chồng riêng một thẻ đôi, còn lại mỗi người một thẻ đơn.
import { asArray, toInt } from "../geometry.js";
import { siblingSort } from "../personOrder.js";
import { buildUnionModel } from "../unions.js";
import { DISPLAY_NODE_TYPE, nodeSize } from "./cardMetrics.js";

const personX = (person) => toInt(person?.tree_x, 0);
const personY = (person) => toInt(person?.tree_y, 0);
export const generationOf = (person) => toInt(person?.generation, 1) || 1;

export function displayNodeIdForCouple(fatherId, motherId, familyId) {
  const ids = [Number(fatherId), Number(motherId)].filter(Number.isFinite).sort((a, b) => a - b);
  return ids.length ? `couple_${ids.join("_")}` : `couple_family_${Number(familyId) || "unknown"}`;
}

// Gắn cho từng người gia đình cha mẹ và thứ tự con (lấy từ dòng con cái đầu tiên theo thứ tự anh chị em).
function peopleWithChildMeta(people, childRows) {
  const metaByPersonId = new Map();
  asArray(childRows).slice().sort(siblingSort).forEach((row) => {
    const personId = Number(row.person_id);
    if (!Number.isFinite(personId) || personId <= 0 || metaByPersonId.has(personId)) return;
    metaByPersonId.set(personId, { child_family_id: Number(row.family_id), child_sort_order: toInt(row.sort_order, 0) });
  });
  return new Map(asArray(people).map((person) => {
    const meta = metaByPersonId.get(Number(person.id));
    return [Number(person.id), meta ? { ...person, ...meta, child_order: meta.child_sort_order } : person];
  }));
}

// Chỉ mục dùng chung cho các bước dựng cảnh; mô hình vợ chồng chỉ dựng một lần ở đây.
export function buildTreeGraph(people, families, childRows, options = {}) {
  const childRowsByFamily = new Map();
  asArray(childRows).forEach((row) => {
    const familyId = Number(row.family_id);
    if (!childRowsByFamily.has(familyId)) childRowsByFamily.set(familyId, []);
    childRowsByFamily.get(familyId).push(row);
  });
  return {
    peopleById: peopleWithChildMeta(people, childRows),
    model: buildUnionModel(people, families, childRows, { lineage: options.lineage }),
    childRowsByFamily,
  };
}

function singleNode(person, view) {
  const size = nodeSize(DISPLAY_NODE_TYPE.SINGLE, view.exportMode, view.cardOrientation);
  return {
    id: `single_${Number(person.id)}`,
    type: DISPLAY_NODE_TYPE.SINGLE,
    person,
    generation: generationOf(person),
    x: personX(person),
    y: personY(person),
    width: size.width,
    height: size.height,
    cardOrientation: view.cardOrientation,
    personIds: [Number(person.id)],
    children: [],
  };
}

function coupleNode(family, husband, wife, graph, view) {
  const size = nodeSize(DISPLAY_NODE_TYPE.COUPLE, view.exportMode, view.cardOrientation);
  // Căn thẻ vào giữa hai ô của vợ và chồng (mỗi ô rộng personSlotWidth).
  const left = Math.min(personX(husband), personX(wife));
  const right = Math.max(personX(husband), personX(wife)) + view.metrics.personSlotWidth;
  return {
    id: displayNodeIdForCouple(husband.id, wife.id, family.id),
    type: DISPLAY_NODE_TYPE.COUPLE,
    familyId: Number(family.id),
    relationshipStatus: String(family.relationship_status || "active"),
    unionType: String(family.union_type || "marriage"),
    husband,
    wife,
    generation: Math.min(generationOf(husband), generationOf(wife)),
    x: Math.round((left + right) / 2 - size.width / 2),
    y: Math.min(personY(husband), personY(wife)),
    width: size.width,
    height: size.height,
    cardOrientation: view.cardOrientation,
    personIds: [Number(husband.id), Number(wife.id)],
    children: asArray(graph.childRowsByFamily.get(Number(family.id)))
      .map((row) => ({ ...row, person: graph.peopleById.get(Number(row.person_id)) }))
      .filter((row) => row.person)
      .sort(siblingSort)
      .map((row) => row.person),
  };
}

// Trả { nodes, nodeByPersonId, nodeByFamilyId }. Cụm nhiều vợ/chồng: mỗi người một thẻ đơn.
export function buildCardNodes(graph, view) {
  const nodes = [];
  const nodeByPersonId = new Map();
  const nodeByFamilyId = new Map();
  const addSingles = (cluster) => cluster.memberIds.forEach((personId) => {
    const person = graph.peopleById.get(Number(personId));
    if (!person) return;
    const node = singleNode(person, view);
    nodes.push(node);
    nodeByPersonId.set(Number(person.id), node);
  });

  graph.model.clusters.forEach((cluster) => {
    const family = cluster.exclusiveCouple ? graph.model.familiesById.get(cluster.coupleFamilyIds[0]) : null;
    const husband = family ? graph.peopleById.get(Number(family.father_id)) : null;
    const wife = family ? graph.peopleById.get(Number(family.mother_id)) : null;
    if (!husband || !wife) {
      addSingles(cluster);
      return;
    }
    const node = coupleNode(family, husband, wife, graph, view);
    nodes.push(node);
    nodeByPersonId.set(Number(husband.id), node);
    nodeByPersonId.set(Number(wife.id), node);
    nodeByFamilyId.set(Number(family.id), node);
  });
  return { nodes, nodeByPersonId, nodeByFamilyId };
}

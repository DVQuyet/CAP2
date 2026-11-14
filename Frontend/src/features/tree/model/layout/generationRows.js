// Bố cục theo hàng đời: tọa độ dọc của một đời, thứ tự trong hàng, và cách xếp dự phòng khi không có quan hệ nào.
import { CANVAS_PADDING, CARD_WIDTH, LEVEL_HEIGHT, SIBLING_GAP } from "../config.js";
import { asArray, snap, toInt } from "../geometry.js";
import { normalizePerson } from "../personOrder.js";

const generationOf = (person) => toInt(person.generation, 1) || 1;

export function generationY(generation) {
  return snap(CANVAS_PADDING + Math.max(0, toInt(generation, 1) - 1) * LEVEL_HEIGHT);
}

// Thủy tổ: những người không có cha mẹ trong cây, ở đời nhỏ nhất.
export function findFounderIds(people, families, childRows) {
  const peopleIds = new Set(asArray(people).map((person) => Number(person.id)));
  const childIds = new Set(asArray(childRows).map((row) => Number(row.person_id)).filter((id) => peopleIds.has(id)));
  const roots = asArray(people).filter((person) => !childIds.has(Number(person.id)));
  const candidates = roots.length ? roots : asArray(people);
  if (!candidates.length) return new Set();
  const minGeneration = Math.min(...candidates.map((person) => toInt(person.generation, 1)));
  return new Set(candidates.filter((person) => toInt(person.generation, 1) === minGeneration).map((person) => Number(person.id)));
}

function groupByGeneration(people) {
  const grouped = new Map();
  people.forEach((person) => {
    const generation = generationOf(person);
    if (!grouped.has(generation)) grouped.set(generation, []);
    grouped.get(generation).push(person);
  });
  return grouped;
}

const rowWidthOf = (count) => count * CARD_WIDTH + Math.max(0, count - 1) * SIBLING_GAP;

// Mỗi đời một hàng, các hàng căn giữa theo hàng rộng nhất. Dùng khi cây chưa có gia đình nào
// và cho những người không nối được vào nhánh nào.
export function simpleGenerationLayout(sourcePeople) {
  const people = asArray(sourcePeople).map(normalizePerson);
  const sorted = people.slice().sort((a, b) => (
    generationOf(a) - generationOf(b)
    || toInt(a.display_order, 0) - toInt(b.display_order, 0)
    || a.id - b.id
  ));
  const grouped = groupByGeneration(sorted);
  const maxRowWidth = Math.max(1, ...[...grouped.values()].map((row) => rowWidthOf(row.length)));

  return people.map((person) => {
    const generation = generationOf(person);
    const row = grouped.get(generation) || [];
    const index = Math.max(0, row.findIndex((item) => item.id === person.id));
    const x = CANVAS_PADDING + Math.max(0, (maxRowWidth - rowWidthOf(row.length)) / 2) + index * (CARD_WIDTH + SIBLING_GAP);
    const y = CANVAS_PADDING + Math.max(0, generation - 1) * LEVEL_HEIGHT;
    return { ...person, tree_x: snap(x), tree_y: snap(y), display_order: index };
  });
}

export function hasManualPosition(person) {
  return toInt(person.tree_x, 0) !== 0 || toInt(person.tree_y, 0) !== 0;
}

// display_order = thứ tự từ trái sang phải trong hàng đời.
export function assignDisplayOrder(people) {
  const orderById = new Map();
  groupByGeneration(people).forEach((members) => {
    members
      .slice()
      .sort((a, b) => a.tree_x - b.tree_x || a.tree_y - b.tree_y || a.id - b.id)
      .forEach((person, index) => orderById.set(person.id, index));
  });
  return people.map((person) => ({ ...person, display_order: orderById.get(person.id) ?? person.display_order ?? 0 }));
}

// Đưa mọi người về đúng hàng đời của mình và dịch cả cây sao cho mép trái cách lề một khoảng đệm.
export function straightenLineageRows(people) {
  const normalized = asArray(people).map(normalizePerson);
  if (!normalized.length) return [];

  const minX = Math.min(...normalized.map((person) => toInt(person.tree_x, CANVAS_PADDING)));
  const offsetX = Math.max(0, CANVAS_PADDING - minX);

  return assignDisplayOrder(
    normalized.map((person) => ({
      ...person,
      tree_x: snap(toInt(person.tree_x, CANVAS_PADDING) + offsetX),
      tree_y: generationY(generationOf(person)),
    })),
  );
}

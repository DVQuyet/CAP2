import { CANVAS_PADDING, CARD_HEIGHT, CARD_WIDTH, FAMILY_GAP, LEVEL_HEIGHT, SIBLING_GAP, SPOUSE_GAP, X_GAP, Y_GAP } from "./treeConstants";
import { asArray, birthTime, normalizePerson, personSort, snap, toInt } from "./treePersonUtils";
import { buildUnionModel } from "./treeUnions";

// Khoảng cách giữa các thành viên trong cụm nhiều vợ/chồng (để thấy đường nối hôn nhân).
const UNION_MEMBER_GAP = 56;

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

function childPersonOf(item) {
  return item?.person || item;
}

const PRECISE_ENOUGH = new Set(["exact", "month", "year"]);

// Thứ tự anh chị em: ngày sinh khi đủ chính xác và khác nhau, rồi "con thứ" (sort_order), rồi id.
// Không đẩy người đã có gia đình lên trước: giữ đúng thứ tự trưởng - thứ.
export function sortChildrenForFamily(children = []) {
  return asArray(children)
    .slice()
    .sort((a, b) => {
      const personA = childPersonOf(a) || {};
      const personB = childPersonOf(b) || {};
      const preciseA = PRECISE_ENOUGH.has(String(personA.birth_date_precision || "exact"));
      const preciseB = PRECISE_ENOUGH.has(String(personB.birth_date_precision || "exact"));
      const birthA = preciseA ? birthTime(personA) : null;
      const birthB = preciseB ? birthTime(personB) : null;
      if (birthA != null && birthB != null && birthA !== birthB) return birthA - birthB;

      const orderA = toInt(a?.sort_order ?? a?.sortOrder, 0);
      const orderB = toInt(b?.sort_order ?? b?.sortOrder, 0);
      if (orderA > 0 && orderB > 0 && orderA !== orderB) return orderA - orderB;
      if (birthA != null && birthB == null) return -1;
      if (birthA == null && birthB != null) return 1;

      return Number(personA.id || 0) - Number(personB.id || 0) || personSort(personA, personB);
    });
}

// ---------- Khối bố cục với đường viền theo đời (để ép sát các nhánh) ----------

function emptyBlock() {
  return { positions: new Map(), refs: new Map(), contour: new Map() };
}

function extendContour(contour, generation, minX, maxX) {
  const current = contour.get(generation);
  if (!current) contour.set(generation, { min: minX, max: maxX });
  else contour.set(generation, { min: Math.min(current.min, minX), max: Math.max(current.max, maxX) });
}

function shiftBlock(block, dx) {
  if (!dx) return block;
  const shifted = emptyBlock();
  block.positions.forEach((item, id) => shifted.positions.set(id, { ...item, x: item.x + dx }));
  block.refs.forEach((item, key) => shifted.refs.set(key, { ...item, x: item.x + dx }));
  block.contour.forEach((range, generation) => shifted.contour.set(generation, { min: range.min + dx, max: range.max + dx }));
  return shifted;
}

function mergeInto(target, source) {
  source.positions.forEach((item, id) => target.positions.set(id, item));
  source.refs.forEach((item, key) => target.refs.set(key, item));
  source.contour.forEach((range, generation) => extendContour(target.contour, generation, range.min, range.max));
  return target;
}

function blockSpan(block) {
  let min = Infinity;
  let max = -Infinity;
  block.contour.forEach((range) => {
    min = Math.min(min, range.min);
    max = Math.max(max, range.max);
  });
  return Number.isFinite(min) ? { min, max } : { min: 0, max: 0 };
}

// Độ dịch nhỏ nhất để `next` nằm bên phải `placed` ở mọi đời chung, cách nhau `gap`.
function minimalShift(placed, next, gap) {
  let shift = -Infinity;
  next.contour.forEach((range, generation) => {
    const other = placed.contour.get(generation);
    if (other) shift = Math.max(shift, other.max + gap - range.min);
  });
  if (shift === -Infinity) {
    const placedSpan = blockSpan(placed);
    const nextSpan = blockSpan(next);
    return placed.contour.size ? placedSpan.max + gap - nextSpan.min : 0;
  }
  return shift;
}

// Khoảng ngang của hàng trên cùng (đời nhỏ nhất) của khối.
function topSpan(block) {
  const generations = [...block.contour.keys()];
  if (!generations.length) return { min: 0, max: 0 };
  return block.contour.get(Math.min(...generations));
}

function packSequential(blocks, gap) {
  const result = emptyBlock();
  blocks.forEach((block, index) => {
    const dx = index === 0 ? 0 : minimalShift(result, block, gap);
    mergeInto(result, shiftBlock(block, dx));
  });
  return result;
}

// ---------- Bố cục cây theo cụm vợ chồng ----------

export function autoLayoutTree(sourcePeople, families = [], childRows = [], options = {}) {
  const people = asArray(sourcePeople).map(normalizePerson);
  if (!people.length) return { people: [], references: [] };
  const model = buildUnionModel(people, families, childRows, options);
  if (!model.familiesById.size) return { people: simpleGenerationLayout(people), references: [] };

  const generationOf = (personId) => toInt(model.peopleById.get(Number(personId))?.generation, 1) || 1;
  const visited = new Set();

  const childItemsOf = (familyId) => {
    const links = (model.linksByFamily.get(Number(familyId)) || [])
      .map((link) => ({ ...link, sort_order: link.sortOrder, person: model.peopleById.get(link.personId) }))
      .filter((link) => link.person);
    return sortChildrenForFamily(links);
  };

  const referenceBlock = (familyId, personId) => {
    const block = emptyBlock();
    const generation = generationOf(personId);
    block.refs.set(`${familyId}:${personId}`, { familyId, personId, x: 0, generation });
    extendContour(block.contour, generation, 0, CARD_WIDTH);
    return block;
  };

  const layoutCluster = (cluster) => {
    visited.add(cluster.id);
    const block = emptyBlock();
    const gap = cluster.exclusiveCouple ? SPOUSE_GAP : UNION_MEMBER_GAP;
    const rowX = new Map();
    let cursor = 0;
    cluster.memberIds.forEach((personId, index) => {
      if (index > 0) cursor += gap;
      rowX.set(personId, cursor);
      block.positions.set(personId, { x: cursor, generation: generationOf(personId) });
      extendContour(block.contour, generationOf(personId), cursor, cursor + CARD_WIDTH);
      cursor += CARD_WIDTH;
    });

    const unionAnchorX = (family) => {
      const ids = [family.father_id, family.mother_id].filter((id) => rowX.has(id));
      if (!ids.length) return cursor / 2;
      return ids.reduce((sum, id) => sum + rowX.get(id) + CARD_WIDTH / 2, 0) / ids.length;
    };

    const groups = cluster.familyIds
      .map((familyId) => model.familiesById.get(familyId))
      .filter(Boolean)
      .map((family) => ({ family, anchorX: unionAnchorX(family), items: childItemsOf(family.id) }))
      .filter((group) => group.items.length)
      .sort((a, b) => a.anchorX - b.anchorX);

    const childrenBlock = emptyBlock();
    groups.forEach((group) => {
      const itemBlocks = group.items.map((item) => {
        const childCluster = model.clusterByPersonId.get(item.personId);
        if (childCluster && model.isHomeLink(group.family.id, item.personId) && !visited.has(childCluster.id)) {
          return layoutCluster(childCluster);
        }
        return referenceBlock(group.family.id, item.personId);
      });
      const groupBlock = packSequential(itemBlocks, SIBLING_GAP);
      const span = topSpan(groupBlock);
      const desired = group.anchorX - (span.min + span.max) / 2;
      const minimum = childrenBlock.contour.size ? minimalShift(childrenBlock, groupBlock, SIBLING_GAP * 2) : -Infinity;
      mergeInto(childrenBlock, shiftBlock(groupBlock, Math.max(desired, minimum)));
    });

    mergeInto(block, childrenBlock);
    const span = blockSpan(block);
    return shiftBlock(block, -span.min);
  };

  const clusterOrder = (a, b) => {
    const genA = Math.min(...a.memberIds.map(generationOf));
    const genB = Math.min(...b.memberIds.map(generationOf));
    if (genA !== genB) return genA - genB;
    return personSort(model.peopleById.get(a.anchorId) || {}, model.peopleById.get(b.anchorId) || {});
  };

  const roots = model.clusters
    .filter((cluster) => !cluster.homeFamilyId || !model.familiesById.has(cluster.homeFamilyId))
    .sort(clusterOrder);

  const rootBlocks = [];
  roots.forEach((cluster) => {
    if (!visited.has(cluster.id)) rootBlocks.push(layoutCluster(cluster));
  });
  // Cụm chưa được đặt (dữ liệu vòng lặp...) được đặt thành gốc riêng.
  model.clusters.slice().sort(clusterOrder).forEach((cluster) => {
    if (!visited.has(cluster.id)) rootBlocks.push(layoutCluster(cluster));
  });
  const forest = packSequential(rootBlocks, FAMILY_GAP);

  const positioned = new Map();
  forest.positions.forEach((item, personId) => {
    positioned.set(personId, { x: CANVAS_PADDING + item.x, y: generationY(item.generation) });
  });

  const leftovers = people.filter((person) => !positioned.has(Number(person.id)));
  if (leftovers.length) {
    const offset = blockSpan(forest).max + FAMILY_GAP;
    simpleGenerationLayout(leftovers).forEach((person) => {
      positioned.set(Number(person.id), { x: person.tree_x + offset, y: person.tree_y });
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
  const finalPeople = straightenLineageRows(assignDisplayOrder(laidOut));
  const finalById = new Map(finalPeople.map((person) => [Number(person.id), person]));

  // Thẻ tham chiếu: vị trí tương đối so với điểm nối của gia đình (để vẫn đúng khi người dùng kéo cha mẹ đi chỗ khác).
  const shiftX = finalPeople.length && laidOut.length
    ? toInt(finalPeople[0].tree_x, 0) - toInt(laidOut.find((person) => person.id === finalPeople[0].id)?.tree_x, 0)
    : 0;
  const references = [];
  forest.refs.forEach((ref) => {
    const family = model.familiesById.get(ref.familyId);
    const parents = [family?.father_id, family?.mother_id].map((id) => finalById.get(Number(id))).filter(Boolean);
    if (!parents.length) return;
    const anchorX = parents.reduce((sum, parent) => sum + toInt(parent.tree_x, 0) + CARD_WIDTH / 2, 0) / parents.length;
    const anchorY = Math.max(...parents.map((parent) => toInt(parent.tree_y, 0) + CARD_HEIGHT));
    references.push({
      familyId: ref.familyId,
      personId: ref.personId,
      dx: snap(CANVAS_PADDING + ref.x + shiftX + CARD_WIDTH / 2 - anchorX),
      dy: snap(generationY(ref.generation) - anchorY),
    });
  });

  return { people: finalPeople, references };
}

export function autoLayoutPeople(sourcePeople, families = [], childRows = [], options = {}) {
  return autoLayoutTree(sourcePeople, families, childRows, options).people;
}

// Vị trí thẻ tham chiếu (con nuôi tại nhà cha mẹ đẻ, con gái lấy chồng nhánh khác...).
export function computeReferencePlacements(sourcePeople, families = [], childRows = [], options = {}) {
  return autoLayoutTree(sourcePeople, families, childRows, options).references;
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

export function straightenLineageRows(people) {
  const normalized = asArray(people).map(normalizePerson);
  if (!normalized.length) return [];

  const minX = Math.min(...normalized.map((person) => toInt(person.tree_x, CANVAS_PADDING)));
  const offsetX = Math.max(0, CANVAS_PADDING - minX);

  return assignDisplayOrder(
    normalized.map((person) => {
      const generation = toInt(person.generation, 1) || 1;
      return {
        ...person,
        tree_x: snap(toInt(person.tree_x, CANVAS_PADDING) + offsetX),
        tree_y: generationY(generation),
      };
    }),
  );
}

export function mergeManualAndAutoLayout(sourcePeople, families = [], childRows = [], options = {}) {
  const normalized = asArray(sourcePeople).map(normalizePerson);
  if (!normalized.length) return [];

  const hasAnyManualPosition = hasManualLayout(normalized);
  if (!hasAnyManualPosition) {
    return autoLayoutPeople(normalized, families, childRows, options);
  }

  const autoPeopleById = new Map(autoLayoutPeople(normalized, families, childRows, options).map((person) => [Number(person.id), person]));
  const merged = normalized.map((person) => {
    const hasManualPosition = toInt(person.tree_x, 0) !== 0 || toInt(person.tree_y, 0) !== 0;
    if (hasManualPosition) return person;
    const autoPerson = autoPeopleById.get(Number(person.id));
    return autoPerson ? { ...person, tree_x: autoPerson.tree_x, tree_y: autoPerson.tree_y, display_order: autoPerson.display_order } : person;
  });

  return assignDisplayOrder(merged);
}

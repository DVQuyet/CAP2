// Tự sắp xếp cây theo cụm vợ chồng. Một lần chạy trả cả vị trí từng người lẫn vị trí thẻ tham chiếu.
import { BRANCH_GAP, CANVAS_PADDING, CARD_HEIGHT, CARD_WIDTH, SIBLING_GAP, SPOUSE_GAP, UNION_MEMBER_GAP } from "../config.js";
import { asArray, snap, toInt } from "../geometry.js";
import { normalizePerson, personSort, sortChildrenForFamily } from "../personOrder.js";
import { buildUnionModel } from "../unions.js";
import { blockSpan, emptyBlock, extendContour, mergeInto, minimalShift, packSequential, shiftBlock, topSpan } from "./blocks.js";
import { assignDisplayOrder, generationY, hasManualPosition, simpleGenerationLayout, straightenLineageRows } from "./generationRows.js";

const generationIn = (model, personId) => toInt(model.peopleById.get(Number(personId))?.generation, 1) || 1;

function childItemsOf(model, familyId) {
  const links = (model.linksByFamily.get(Number(familyId)) || [])
    .map((link) => ({ ...link, sort_order: link.sortOrder, person: model.peopleById.get(link.personId) }))
    .filter((link) => link.person);
  return sortChildrenForFamily(links);
}

function referenceBlock(model, familyId, personId) {
  const block = emptyBlock();
  const generation = generationIn(model, personId);
  block.refs.set(`${familyId}:${personId}`, { familyId, personId, x: 0, generation });
  extendContour(block.contour, generation, 0, CARD_WIDTH);
  return block;
}

// Hàng vợ chồng của một cụm: mỗi người một ô, trả vị trí ngang từng người và bề rộng cả hàng.
function placeClusterRow(model, cluster, block) {
  const gap = cluster.exclusiveCouple ? SPOUSE_GAP : UNION_MEMBER_GAP;
  const rowX = new Map();
  let cursor = 0;
  cluster.memberIds.forEach((personId, index) => {
    if (index > 0) cursor += gap;
    const generation = generationIn(model, personId);
    rowX.set(personId, cursor);
    block.positions.set(personId, { x: cursor, generation });
    extendContour(block.contour, generation, cursor, cursor + CARD_WIDTH);
    cursor += CARD_WIDTH;
  });
  return { rowX, width: cursor };
}

// Điểm giữa của một cuộc hôn nhân trên hàng vợ chồng: con cái được căn dưới điểm này.
function unionAnchorX(family, rowX, rowWidth) {
  const ids = [family.father_id, family.mother_id].filter((id) => rowX.has(id));
  if (!ids.length) return rowWidth / 2;
  return ids.reduce((sum, id) => sum + rowX.get(id) + CARD_WIDTH / 2, 0) / ids.length;
}

// Đặt một cụm vợ chồng cùng toàn bộ con cháu; con đã có vị trí chính ở nơi khác thành thẻ tham chiếu.
function layoutCluster(model, cluster, visited) {
  visited.add(cluster.id);
  const block = emptyBlock();
  const { rowX, width } = placeClusterRow(model, cluster, block);

  const groups = cluster.familyIds
    .map((familyId) => model.familiesById.get(familyId))
    .filter(Boolean)
    .map((family) => ({ family, anchorX: unionAnchorX(family, rowX, width), items: childItemsOf(model, family.id) }))
    .filter((group) => group.items.length)
    .sort((a, b) => a.anchorX - b.anchorX);

  const childrenBlock = emptyBlock();
  groups.forEach((group) => {
    const itemBlocks = group.items.map((item) => {
      const childCluster = model.clusterByPersonId.get(item.personId);
      const isHome = childCluster && model.isHomeLink(group.family.id, item.personId) && !visited.has(childCluster.id);
      return isHome ? layoutCluster(model, childCluster, visited) : referenceBlock(model, group.family.id, item.personId);
    });
    const groupBlock = packSequential(itemBlocks, SIBLING_GAP);
    const span = topSpan(groupBlock);
    const desired = group.anchorX - (span.min + span.max) / 2;
    const minimum = childrenBlock.contour.size ? minimalShift(childrenBlock, groupBlock, SIBLING_GAP * 2) : -Infinity;
    mergeInto(childrenBlock, shiftBlock(groupBlock, Math.max(desired, minimum)));
  });

  mergeInto(block, childrenBlock);
  return shiftBlock(block, -blockSpan(block).min);
}

// Cả rừng: các cụm gốc (không có gia đình cha mẹ trong cây) xếp cạnh nhau, đời trên trước.
function layoutForest(model) {
  const clusterOrder = (a, b) => {
    const genA = Math.min(...a.memberIds.map((id) => generationIn(model, id)));
    const genB = Math.min(...b.memberIds.map((id) => generationIn(model, id)));
    if (genA !== genB) return genA - genB;
    return personSort(model.peopleById.get(a.anchorId) || {}, model.peopleById.get(b.anchorId) || {});
  };
  const visited = new Set();
  const rootBlocks = [];
  const place = (cluster) => {
    if (!visited.has(cluster.id)) rootBlocks.push(layoutCluster(model, cluster, visited));
  };
  model.clusters
    .filter((cluster) => !cluster.homeFamilyId || !model.familiesById.has(cluster.homeFamilyId))
    .sort(clusterOrder)
    .forEach(place);
  // Cụm chưa được đặt (dữ liệu vòng lặp...) được đặt thành gốc riêng.
  model.clusters.slice().sort(clusterOrder).forEach(place);
  return packSequential(rootBlocks, BRANCH_GAP);
}

function positionPeople(people, forest) {
  const positioned = new Map();
  forest.positions.forEach((item, personId) => {
    positioned.set(personId, { x: CANVAS_PADDING + item.x, y: generationY(item.generation) });
  });

  const leftovers = people.filter((person) => !positioned.has(Number(person.id)));
  if (leftovers.length) {
    const offset = blockSpan(forest).max + BRANCH_GAP;
    simpleGenerationLayout(leftovers).forEach((person) => {
      positioned.set(Number(person.id), { x: person.tree_x + offset, y: person.tree_y });
    });
  }

  return people.map((person) => {
    const position = positioned.get(Number(person.id));
    return {
      ...person,
      tree_x: snap(position?.x ?? person.tree_x),
      tree_y: snap(position?.y ?? generationY(person.generation)),
    };
  });
}

// Thẻ tham chiếu: vị trí tương đối so với điểm nối của gia đình (để vẫn đúng khi người dùng kéo cha mẹ đi chỗ khác).
function referencePlacements(model, forest, finalPeople, shiftX) {
  const finalById = new Map(finalPeople.map((person) => [Number(person.id), person]));
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
  return references;
}

// Trả { people, references }: people mang tree_x/tree_y/display_order mới;
// references là vị trí thẻ tham chiếu (con nuôi tại nhà cha mẹ đẻ, con gái lấy chồng nhánh khác...).
export function layoutTree(sourcePeople, families = [], childRows = [], options = {}) {
  const people = asArray(sourcePeople).map(normalizePerson);
  if (!people.length) return { people: [], references: [] };
  const model = buildUnionModel(people, families, childRows, options);
  if (!model.familiesById.size) return { people: simpleGenerationLayout(people), references: [] };

  const forest = layoutForest(model);
  const laidOut = positionPeople(people, forest);
  const finalPeople = straightenLineageRows(assignDisplayOrder(laidOut));
  // straightenLineageRows có thể dịch cả cây sang phải; thẻ tham chiếu phải dịch theo.
  const shiftX = toInt(finalPeople[0].tree_x, 0) - toInt(laidOut.find((person) => person.id === finalPeople[0].id)?.tree_x, 0);
  return { people: finalPeople, references: referencePlacements(model, forest, finalPeople, shiftX) };
}

// Giữ vị trí người dùng đã kéo tay; ai chưa có vị trí thì lấy từ kết quả tự sắp xếp (`autoPeople` = layoutTree().people).
export function mergeManualLayout(sourcePeople, autoPeople) {
  const normalized = asArray(sourcePeople).map(normalizePerson);
  if (!normalized.length) return [];
  if (!normalized.some(hasManualPosition)) return autoPeople;

  const autoById = new Map(asArray(autoPeople).map((person) => [Number(person.id), person]));
  const merged = normalized.map((person) => {
    if (hasManualPosition(person)) return person;
    const auto = autoById.get(Number(person.id));
    return auto ? { ...person, tree_x: auto.tree_x, tree_y: auto.tree_y, display_order: auto.display_order } : person;
  });
  return assignDisplayOrder(merged);
}

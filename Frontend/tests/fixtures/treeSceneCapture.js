// Chạy một dòng họ mẫu qua lõi vẽ cây theo đúng cách trình sửa cây và phần xuất ảnh đang gọi,
// rồi gom kết quả thành dữ liệu thuần để so sánh giữa các lần sửa mã.
import { createHash } from "node:crypto";

// Bằng CANVAS_PADDING của cây; viết số ở đây để ảnh chuẩn không đổi theo khi cấu hình đổi.
const RENDER_PADDING = 140;

const personView = (person) => (person ? {
  id: person.id,
  child_family_id: person.child_family_id ?? null,
  child_sort_order: person.child_sort_order ?? null,
  child_order: person.child_order ?? null,
} : null);

const nodeView = (node) => ({
  id: node.id,
  type: node.type,
  x: node.x,
  y: node.y,
  width: node.width,
  height: node.height,
  generation: node.generation,
  cardOrientation: node.cardOrientation,
  personIds: node.personIds,
  familyId: node.familyId ?? null,
  refPersonId: node.refPersonId ?? null,
  childType: node.childType ?? null,
  relationshipStatus: node.relationshipStatus ?? null,
  unionType: node.unionType ?? null,
  person: personView(node.person),
  husband: personView(node.husband),
  wife: personView(node.wife),
  children: (node.children || []).map((child) => child.id),
});

const anchorView = ([familyId, anchor]) => ({
  familyId,
  id: anchor.id,
  x: anchor.x,
  y: anchor.y,
  width: anchor.width,
  height: anchor.height,
  personIds: anchor.personIds,
});

const positionView = (person) => [person.id, person.tree_x, person.tree_y, person.display_order];

function sceneView(api, people, sample, options, lineRoutes) {
  const tree = api.buildDisplayTree(people, sample.families, sample.childRows, options);
  const lines = api.buildDisplayTreeLines(tree, sample.families, sample.childRows, lineRoutes);
  return {
    nodes: tree.nodes.map(nodeView),
    anchors: [...tree.unionAnchors.entries()].map(anchorView),
    connectors: tree.unionConnectors,
    references: [...tree.referenceNodes.keys()],
    nodeByPersonId: [...tree.nodeByPersonId.entries()].map(([id, node]) => [id, node.id]),
    nodeByFamilyId: [...tree.nodeByFamilyId.entries()].map(([id, node]) => [id, node.id]),
    lines,
  };
}

// Giống FamilyTreeEditor: dịch cả cây để người ngoài cùng bên trái/trên cách mép đúng một khoảng đệm.
function withRenderOffset(people) {
  if (!people.length) return people;
  const offsetX = Math.max(0, RENDER_PADDING - Math.min(...people.map((person) => person.tree_x)));
  const offsetY = Math.max(0, RENDER_PADDING - Math.min(...people.map((person) => person.tree_y)));
  return people.map((person) => ({ ...person, tree_x: person.tree_x + offsetX, tree_y: person.tree_y + offsetY }));
}

export function captureSample(api, sample) {
  const { families, childRows } = sample;
  const auto = api.autoLayoutPeople(sample.people, families, childRows);
  const references = api.computeReferencePlacements(sample.people, families, childRows);
  const merged = api.mergeManualAndAutoLayout(sample.manualPeople, families, childRows);
  const matrilineal = api.autoLayoutPeople(sample.people, families, childRows, { lineage: "matrilineal" });
  const renderPeople = withRenderOffset(auto);
  const manualRender = withRenderOffset(merged);
  return {
    auto: auto.map(positionView),
    references,
    merged: merged.map(positionView),
    matrilineal: matrilineal.map(positionView),
    screen: sceneView(api, renderPeople, sample, { cardOrientation: "horizontal", referencePlacements: references }, {}),
    screenRoutes: sceneView(api, renderPeople, sample, { cardOrientation: "horizontal", referencePlacements: references }, sample.lineRoutes),
    screenVertical: sceneView(api, renderPeople, sample, { cardOrientation: "vertical", referencePlacements: references }, sample.lineRoutes),
    screenManual: sceneView(api, manualRender, sample, { cardOrientation: "horizontal", referencePlacements: references }, sample.lineRoutes),
    exportDetail: sceneView(api, auto, sample, { exportMode: true, exportModeName: "detail", cardOrientation: "horizontal", packRows: true }, {}),
    exportOverview: sceneView(api, auto, sample, { exportMode: true, exportModeName: "overview", cardOrientation: "vertical", packRows: true }, sample.lineRoutes),
  };
}

// Sắp khóa theo bảng chữ cái để thứ tự khai báo thuộc tính không làm đổi mã băm.
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
}

export function digest(value) {
  return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex").slice(0, 16);
}

// Mỗi phần của mẫu một mã băm, để khi lệch biết lệch ở khâu nào.
export function digestSample(capture) {
  return Object.fromEntries(Object.entries(capture).map(([key, value]) => [key, digest(value)]));
}

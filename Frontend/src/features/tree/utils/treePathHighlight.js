// Tô sáng đường quan hệ trên cây (từ "Xem trên cây" của trợ lý AI). Toàn bộ là hàm thuần:
// path (danh sách id người theo thứ tự) -> tập node + tập cạnh; không đụng trạng thái thu gọn đã lưu của người dùng.

const asArray = (value) => (Array.isArray(value) ? value : []);

export function normalizePathIds(raw) {
  const ids = [];
  asArray(raw).forEach((value) => {
    const id = Number(value);
    if (Number.isInteger(id) && id > 0 && ids[ids.length - 1] !== id) ids.push(id);
  });
  return ids;
}

export const spouseEdgeKey = (a, b) => `spouse:${Math.min(Number(a), Number(b))}-${Math.max(Number(a), Number(b))}`;
export const parentEdgeKey = (parentId, childId) => `parent:${Number(parentId)}>${Number(childId)}`;

// Với mỗi cặp liền kề trên đường đi: vợ/chồng (cùng một family) hoặc cha/mẹ-con (childRows).
// Cặp không có cạnh trực tiếp trong dữ liệu (đường đi bị lọc quyền riêng tư...) vẫn có node, chỉ thiếu cạnh.
export function computePathHighlight(rawPath, families = [], childRows = []) {
  const pathIds = normalizePathIds(rawPath);
  const nodeIds = new Set(pathIds);
  const edgeKeys = new Set();
  const spouseFamilyIds = new Set();
  const parentEdges = []; // { familyId, parentId, childId }

  const familyById = new Map(asArray(families).map((family) => [Number(family.id), family]));
  const childFamilies = new Map(); // childId -> [familyId]
  asArray(childRows).forEach((row) => {
    const childId = Number(row.person_id);
    const list = childFamilies.get(childId) || [];
    list.push(Number(row.family_id));
    childFamilies.set(childId, list);
  });
  const parentsOf = (family) => [family?.father_id, family?.mother_id].filter(Boolean).map(Number);

  for (let i = 0; i < pathIds.length - 1; i += 1) {
    const a = pathIds[i];
    const b = pathIds[i + 1];
    for (const [familyId, family] of familyById) {
      const parents = parentsOf(family);
      if (parents.length === 2 && parents.includes(a) && parents.includes(b)) {
        edgeKeys.add(spouseEdgeKey(a, b));
        spouseFamilyIds.add(familyId);
      }
    }
    [[a, b], [b, a]].forEach(([parentId, childId]) => {
      asArray(childFamilies.get(childId)).forEach((familyId) => {
        if (parentsOf(familyById.get(familyId)).includes(parentId)) {
          edgeKeys.add(parentEdgeKey(parentId, childId));
          parentEdges.push({ familyId, parentId, childId });
        }
      });
    });
  }

  return { pathIds, nodeIds, edgeKeys, spouseFamilyIds, parentEdges };
}

// Đường vẽ (từ treeLines) có nằm trên đường quan hệ không.
// - đường vợ chồng: theo familyId của cặp trên đường đi;
// - đường cha/mẹ-con: cùng familyId và có mặt người con của cạnh đó (đường thân chung chứa mọi người con nên cũng sáng).
export function isLineOnPath(line, highlight) {
  if (!line || !highlight || !highlight.nodeIds?.size) return false;
  const familyId = Number(line.familyId);
  if (line.type === "spouse") return highlight.spouseFamilyIds.has(familyId);
  if (line.type === "blood") {
    const related = asArray(line.relatedPersonIds).map(Number);
    return highlight.parentEdges.some((edge) => edge.familyId === familyId && related.includes(edge.childId));
  }
  return false;
}

// Bỏ id khỏi tập ẩn (do thu gọn nhánh) mà không chạm vào trạng thái thu gọn đã lưu.
export function revealHiddenIds(hiddenIds, revealIds) {
  const next = new Set(hiddenIds);
  asArray([...(revealIds || [])]).forEach((id) => next.delete(Number(id)));
  return next;
}

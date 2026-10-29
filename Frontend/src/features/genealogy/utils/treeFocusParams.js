// Tham số "Xem trên cây" từ trợ lý AI: ?focus=<id>&highlight=<id,id,...>&path=<id,id,...> (path = đường quan hệ theo thứ tự, chỉ id người)
export const TREE_FOCUS_EVENT = "cap2:tree-focus";

function toIds(values) {
  const seen = new Set();
  const ids = [];
  for (const value of values) {
    const id = Number(value);
    if (Number.isInteger(id) && id > 0 && !seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  }
  return ids;
}

// Đọc từ chuỗi query (vd. window.location.search). Trả { focus, highlight, path? } hoặc null nếu không có người hợp lệ.
// path chỉ có nghĩa khi có từ 2 người trở lên, giữ nguyên thứ tự.
export function parseTreeFocusParams(search = "") {
  const params = new URLSearchParams(String(search || ""));
  const highlight = toIds(String(params.get("highlight") || "").split(","));
  const [focus] = toIds([params.get("focus")]);
  const pathIds = toIds(String(params.get("path") || "").split(","));
  const target = focus || highlight[0] || pathIds[0];
  if (!target) return null;
  const result = { focus: target, highlight: highlight.length ? highlight : [target] };
  if (pathIds.length >= 2) result.path = pathIds;
  return result;
}

// Đường dẫn trang cây theo vai trò.
export function treePathForRole(role) {
  return role === "manager" || role === "admin" ? "/manager/genealogy" : "/user/family-tree";
}

export function isTreePath(pathname = "") {
  return pathname === "/user/family-tree" || pathname === "/manager/genealogy";
}

export function buildTreeFocusUrl(role, personIds = [], pathIds = []) {
  const ids = toIds(personIds);
  if (!ids.length) return null;
  const query = new URLSearchParams({ focus: String(ids[0]), highlight: ids.join(",") });
  const path = toIds(pathIds);
  if (path.length >= 2) query.set("path", path.join(","));
  return `${treePathForRole(role)}?${query.toString()}`;
}

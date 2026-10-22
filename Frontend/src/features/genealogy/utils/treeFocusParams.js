// Tham số "Xem trên cây" từ trợ lý AI: ?focus=<id>&highlight=<id,id,...>
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

// Đọc từ chuỗi query (vd. window.location.search). Trả { focus, highlight } hoặc null nếu không có người hợp lệ.
export function parseTreeFocusParams(search = "") {
  const params = new URLSearchParams(String(search || ""));
  const highlight = toIds(String(params.get("highlight") || "").split(","));
  const [focus] = toIds([params.get("focus")]);
  const target = focus || highlight[0];
  if (!target) return null;
  return { focus: target, highlight: highlight.length ? highlight : [target] };
}

// Đường dẫn trang cây theo vai trò.
export function treePathForRole(role) {
  return role === "manager" || role === "admin" ? "/manager/genealogy" : "/user/family-tree";
}

export function isTreePath(pathname = "") {
  return pathname === "/user/family-tree" || pathname === "/manager/genealogy";
}

export function buildTreeFocusUrl(role, personIds = []) {
  const ids = toIds(personIds);
  if (!ids.length) return null;
  const query = new URLSearchParams({ focus: String(ids[0]), highlight: ids.join(",") });
  return `${treePathForRole(role)}?${query.toString()}`;
}

// Sắp lại nút của thanh công cụ cây theo việc người dùng làm (hàm thuần, không đụng React):
// - Nút luôn có chữ: thao tác chính (Thêm người) và Xuất ảnh.
// - "Bố cục": tự sắp xếp, lưu bố cục và cả nhóm "layout" của menu cũ; xoá bố cục nháp đánh dấu nguy hiểm.
// - "⋯": các nhóm còn lại (nhánh, dữ liệu) và tuỳ chỉnh hiển thị.
const LAYOUT_ACTION_KEYS = ["auto", "save"];
const DANGER_KEYS = new Set(["clearLocal"]);

const visible = (item) => item && !item.hidden;
const markDanger = (item) => (DANGER_KEYS.has(item.key) ? { ...item, danger: true } : item);

// Nhóm menu cho bảng công cụ trên điện thoại: cùng cách đánh dấu mục nguy hiểm như menu "Bố cục".
export function markToolGroups(toolGroups = []) {
  return toolGroups.map((group) => ({ ...group, items: (group.items || []).map(markDanger) }));
}

// Khoá lọc của một người trong bộ chọn cây: tên không dấu + "doi N" + "generation N"
// (gõ "đời 3", "doi 3" hay "generation 3" đều khớp, vì chữ gõ cũng được bỏ dấu cùng cách).
export function personFilterKey(normalizedName, generation) {
  const gen = Number(generation) || 1;
  return `${normalizedName} doi ${gen} generation ${gen}`;
}

export function splitToolbarActions(primaryActions = [], toolGroups = []) {
  const actions = primaryActions.filter(visible);
  const layoutGroup = toolGroups.find((group) => group.key === "layout");
  const layoutItems = [
    ...actions.filter((action) => LAYOUT_ACTION_KEYS.includes(action.key)).map((action) => ({ ...action, primary: false })),
    ...(layoutGroup ? layoutGroup.items : []),
  ]
    .filter(visible)
    .map(markDanger);

  return {
    buttons: actions.filter((action) => !LAYOUT_ACTION_KEYS.includes(action.key)),
    layoutItems,
    otherGroups: toolGroups.filter((group) => group.key !== "layout"),
  };
}

// Chữ trên nút chọn cây: "Cả dòng họ" hoặc "Theo: <tên>" (chưa có tên thì dùng #id để không báo sai là cả dòng họ).
export function viewChipLabel(t, rootSelector) {
  if (rootSelector?.mode === "root") {
    const name = rootSelector.rootName || (rootSelector.rootPersonId ? `#${rootSelector.rootPersonId}` : "");
    if (name) return t("tree.viewMode.byPersonChip", { name });
  }
  return t("tree.viewMode.wholeClan");
}

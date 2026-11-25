// Sắp lại nút của thanh công cụ cây theo việc người dùng làm (hàm thuần, không đụng React):
// - Nút luôn có chữ: thao tác chính (Thêm người) và Xuất ảnh.
// - "Bố cục": tự sắp xếp, lưu bố cục và cả nhóm "layout" của menu cũ; xoá bố cục nháp đánh dấu nguy hiểm.
// - "⋯": các nhóm còn lại (nhánh, dữ liệu) và tuỳ chỉnh hiển thị.
const LAYOUT_ACTION_KEYS = ["auto", "save"];
const DANGER_KEYS = new Set(["clearLocal"]);

const visible = (item) => item && !item.hidden;

export function splitToolbarActions(primaryActions = [], toolGroups = []) {
  const actions = primaryActions.filter(visible);
  const layoutGroup = toolGroups.find((group) => group.key === "layout");
  const layoutItems = [
    ...actions.filter((action) => LAYOUT_ACTION_KEYS.includes(action.key)).map((action) => ({ ...action, primary: false })),
    ...(layoutGroup ? layoutGroup.items : []),
  ]
    .filter(visible)
    .map((item) => (DANGER_KEYS.has(item.key) ? { ...item, danger: true } : item));

  return {
    buttons: actions.filter((action) => !LAYOUT_ACTION_KEYS.includes(action.key)),
    layoutItems,
    otherGroups: toolGroups.filter((group) => group.key !== "layout"),
  };
}

// Chữ trên nút chọn cây: "Cả dòng họ" hoặc "Theo: <tên>".
export function viewChipLabel(t, rootSelector) {
  if (rootSelector?.mode === "root" && rootSelector.rootName) {
    return t("tree.viewMode.byPersonChip", { name: rootSelector.rootName });
  }
  return t("tree.viewMode.wholeClan");
}

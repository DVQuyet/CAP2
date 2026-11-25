import test from "node:test";
import assert from "node:assert/strict";

import { markToolGroups, personFilterKey, splitToolbarActions, viewChipLabel } from "../src/features/tree/components/TreeToolbarParts/toolbarGroups.js";

const primary = [
  { key: "add", label: "Thêm người", primary: true },
  { key: "auto", label: "Tự sắp xếp" },
  { key: "save", label: "Lưu bố cục", hidden: true },
  { key: "export", label: "Xuất ảnh" },
];
const groups = [
  { key: "branches", items: [{ key: "expandAll" }] },
  { key: "layout", items: [{ key: "resetLines" }, { key: "clearLocal" }, { key: "bulk", hidden: true }] },
  { key: "data", items: [{ key: "validate" }] },
];

test("nút có chữ chỉ còn thêm người và xuất ảnh", () => {
  const { buttons } = splitToolbarActions(primary, groups);
  assert.deepEqual(buttons.map((b) => b.key), ["add", "export"]);
});

test("menu Bố cục gom tự sắp xếp và nhóm layout, bỏ mục ẩn, xoá bố cục nháp là nguy hiểm", () => {
  const { layoutItems } = splitToolbarActions(primary, groups);
  assert.deepEqual(layoutItems.map((i) => i.key), ["auto", "resetLines", "clearLocal"]);
  assert.equal(layoutItems.find((i) => i.key === "clearLocal").danger, true);
  assert.equal(layoutItems.find((i) => i.key === "auto").primary, false);
});

test("menu ⋯ giữ các nhóm khác, không còn nhóm layout", () => {
  const { otherGroups } = splitToolbarActions(primary, groups);
  assert.deepEqual(otherGroups.map((g) => g.key), ["branches", "data"]);
});

test("nút chọn cây: cả dòng họ, theo tên, và #id khi chưa có tên (không báo nhầm là cả dòng họ)", () => {
  const t = (key, vars) => (vars ? `${key}:${vars.name}` : key);
  assert.equal(viewChipLabel(t, { mode: "full" }), "tree.viewMode.wholeClan");
  assert.equal(viewChipLabel(t, { mode: "root", rootName: "Bình" }), "tree.viewMode.byPersonChip:Bình");
  assert.equal(viewChipLabel(t, { mode: "root", rootPersonId: 12 }), "tree.viewMode.byPersonChip:#12");
  assert.equal(viewChipLabel(t, { mode: "root" }), "tree.viewMode.wholeClan");
});

test("lọc người theo đời: gõ 'doi 3' hoặc 'generation 3' đều khớp, không khớp đời khác", () => {
  const key = personFilterKey("dinh viet binh", 3);
  assert.ok(key.includes("doi 3"));
  assert.ok(key.includes("generation 3"));
  assert.ok(!key.includes("doi 4"));
  assert.ok(personFilterKey("an", undefined).includes("doi 1"));
});

test("bảng công cụ điện thoại cũng đánh dấu xoá bố cục nháp là nguy hiểm", () => {
  const marked = markToolGroups(groups);
  const layout = marked.find((g) => g.key === "layout");
  assert.equal(layout.items.find((i) => i.key === "clearLocal").danger, true);
  assert.equal(layout.items.find((i) => i.key === "resetLines").danger, undefined);
  assert.equal(groups[1].items[1].danger, undefined, "không sửa mảng gốc");
});

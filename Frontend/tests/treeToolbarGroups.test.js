import test from "node:test";
import assert from "node:assert/strict";

import { splitToolbarActions, viewChipLabel } from "../src/features/tree/components/TreeToolbarParts/toolbarGroups.js";

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

test("chữ trên nút chọn cây", () => {
  const t = (key, vars) => (vars ? `${key}:${vars.name}` : key);
  assert.equal(viewChipLabel(t, { mode: "full" }), "tree.viewMode.wholeClan");
  assert.equal(viewChipLabel(t, { mode: "root", rootName: "Bình" }), "tree.viewMode.byPersonChip:Bình");
  assert.equal(viewChipLabel(t, { mode: "root" }), "tree.viewMode.wholeClan");
});

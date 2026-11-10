import test from "node:test";
import assert from "node:assert/strict";

import {
  computePathHighlight,
  isLineOnPath,
  normalizePathIds,
  parentEdgeKey,
  revealHiddenIds,
  spouseEdgeKey,
} from "../src/features/genealogy/utils/treePathHighlight.js";
import { buildTreeFocusUrl, parseTreeFocusParams } from "../src/features/genealogy/utils/treeFocusParams.js";

// 1 = ông, 2 = bà (family 10); con 3 và 4 (family 10); 3 lấy 5 (family 11); con 6 của 3 và 5.
const families = [
  { id: 10, father_id: 1, mother_id: 2 },
  { id: 11, father_id: 3, mother_id: 5 },
];
const childRows = [
  { family_id: 10, person_id: 3 },
  { family_id: 10, person_id: 4 },
  { family_id: 11, person_id: 6 },
];

test("normalizePathIds bỏ giá trị sai và trùng liền kề", () => {
  assert.deepEqual(normalizePathIds(["4", 4, "x", 0, 6, -2, 7]), [4, 6, 7]);
  assert.deepEqual(normalizePathIds(null), []);
});

test("đường anh em: lên cha rồi xuống em -> node + cạnh cha-con", () => {
  const highlight = computePathHighlight([3, 1, 4], families, childRows);
  assert.deepEqual([...highlight.nodeIds].sort(), [1, 3, 4]);
  assert.ok(highlight.edgeKeys.has(parentEdgeKey(1, 3)));
  assert.ok(highlight.edgeKeys.has(parentEdgeKey(1, 4)));
  assert.equal(highlight.spouseFamilyIds.size, 0);
});

test("đường qua hôn nhân: vợ/chồng -> cạnh spouse, family của cặp", () => {
  const highlight = computePathHighlight([6, 3, 5], families, childRows);
  assert.ok(highlight.edgeKeys.has(parentEdgeKey(3, 6)));
  assert.ok(highlight.edgeKeys.has(spouseEdgeKey(5, 3)));
  assert.deepEqual([...highlight.spouseFamilyIds], [11]);
});

test("cặp không có cạnh trực tiếp vẫn giữ node, không bịa cạnh", () => {
  const highlight = computePathHighlight([6, 4], families, childRows);
  assert.deepEqual([...highlight.nodeIds].sort(), [4, 6]);
  assert.equal(highlight.edgeKeys.size, 0);
});

test("isLineOnPath: đường vợ chồng, đường con riêng và đường thân chung", () => {
  const highlight = computePathHighlight([3, 1, 4], families, childRows);
  const trunk = { type: "blood", familyId: 10, relatedPersonIds: [1, 2, 3, 4] };
  const childLine3 = { type: "blood", familyId: 10, relatedPersonIds: [1, 2, 3] };
  const childLine4 = { type: "blood", familyId: 10, relatedPersonIds: [1, 2, 4] };
  const otherFamily = { type: "blood", familyId: 11, relatedPersonIds: [3, 5, 6] };
  const spouse10 = { type: "spouse", familyId: 10, relatedPersonIds: [1, 2] };
  assert.equal(isLineOnPath(trunk, highlight), true);
  assert.equal(isLineOnPath(childLine3, highlight), true);
  assert.equal(isLineOnPath(childLine4, highlight), true);
  assert.equal(isLineOnPath(otherFamily, highlight), false);
  assert.equal(isLineOnPath(spouse10, highlight), false);

  const onlyChild3 = computePathHighlight([1, 3], families, childRows);
  assert.equal(isLineOnPath(childLine4, onlyChild3), false);
  assert.equal(isLineOnPath(childLine3, onlyChild3), true);
  assert.equal(isLineOnPath(spouse10, computePathHighlight([1, 2], families, childRows)), true);
  assert.equal(isLineOnPath(trunk, null), false);
});

test("revealHiddenIds không sửa tập gốc", () => {
  const hidden = new Set([3, 4, 9]);
  const next = revealHiddenIds(hidden, new Set([3, 9]));
  assert.deepEqual([...next], [4]);
  assert.deepEqual([...hidden].sort(), [3, 4, 9]);
});

test("URL và tham số có path (chỉ id người)", () => {
  const url = buildTreeFocusUrl("member", [6, 3, 5], [6, 3, 5]);
  assert.equal(url, "/user/family-tree?focus=6&highlight=6%2C3%2C5&path=6%2C3%2C5");
  assert.deepEqual(parseTreeFocusParams("?focus=6&highlight=6,3,5&path=6,3,x,5"), { focus: 6, highlight: [6, 3, 5], path: [6, 3, 5] });
  assert.deepEqual(parseTreeFocusParams("?focus=6&path=6"), { focus: 6, highlight: [6] });
  assert.equal(buildTreeFocusUrl("member", [4, 6]), "/user/family-tree?focus=4&highlight=4%2C6");
});

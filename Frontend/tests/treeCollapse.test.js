import test from "node:test";
import assert from "node:assert/strict";

import {
  buildCollapseStorageKey,
  computeDefaultCollapseState,
  computeExpandForTarget,
  parseCollapseState,
  resolveSelfPersonId,
  serializeCollapseState,
} from "../src/features/genealogy/utils/tree-editor/treeCollapse.js";
import { getHiddenDescendantIds } from "../src/features/genealogy/utils/treeFilter.js";

// 1 (+2 vợ) -> 3 (+4 vợ) -> 5 -> 6 -> 7 ; 3 cũng có con 8
const people = [1, 2, 3, 4, 5, 6, 7, 8].map((id) => ({ id }));
const families = [
  { id: 10, father_id: 1, mother_id: 2 },
  { id: 11, father_id: 3, mother_id: 4 },
  { id: 12, father_id: 5, mother_id: null },
  { id: 13, father_id: 6, mother_id: null },
];
const childRows = [
  { family_id: 10, person_id: 3 },
  { family_id: 11, person_id: 5 },
  { family_id: 11, person_id: 8 },
  { family_id: 12, person_id: 6 },
  { family_id: 13, person_id: 7 },
];
const visibleAfter = (state) => {
  const hidden = getHiddenDescendantIds([...state.collapsed], people, families, childRows);
  state.hiddenAncestors.forEach((id) => hidden.add(id));
  return people.map((p) => p.id).filter((id) => !hidden.has(id));
};

test("không có self: hiện 3 đời đầu từ người sáng lập", () => {
  const state = computeDefaultCollapseState({ people, families, childRows });
  assert.deepEqual([...state.collapsed], [5]);
  assert.equal(state.hiddenAncestors.size, 0);
  assert.deepEqual(visibleAfter(state), [1, 2, 3, 4, 5, 8]);
});

test("có self: 1 đời trên và 2 đời dưới", () => {
  const state = computeDefaultCollapseState({ people, families, childRows, selfId: 5 });
  assert.deepEqual([...state.hiddenAncestors].sort(), [1, 2]);
  assert.equal(state.collapsed.size, 0);
  assert.deepEqual(visibleAfter(state), [3, 4, 5, 6, 7, 8]);
});

test("cây nhỏ không bị thu gọn", () => {
  const state = computeDefaultCollapseState({ people: people.slice(0, 4), families: families.slice(0, 2), childRows: childRows.slice(0, 1), selfId: 3 });
  assert.equal(state.collapsed.size, 0);
  assert.equal(state.hiddenAncestors.size, 0);
});

test("computeExpandForTarget mở tổ tiên và chính người bị ẩn", () => {
  const down = computeExpandForTarget(7, people, families, childRows);
  assert.deepEqual([...down.collapse].sort(), [1, 2, 3, 4, 5, 6]);
  const spouse = computeExpandForTarget(4, people, families, childRows);
  assert.ok(spouse.hiddenAncestors.has(4) && spouse.hiddenAncestors.has(3));
  assert.equal(computeExpandForTarget(999, people, families, childRows).collapse.size, 0);
});

test("lưu/đọc trạng thái, bỏ id không còn và JSON hỏng", () => {
  const raw = serializeCollapseState({ collapsed: new Set([5, 99]), hiddenAncestors: new Set([1]) });
  const back = parseCollapseState(raw, people);
  assert.deepEqual([...back.collapsed], [5]);
  assert.deepEqual([...back.hiddenAncestors], [1]);
  assert.equal(parseCollapseState("{oops", people), null);
  assert.equal(parseCollapseState(null, people), null);
});

test("khóa lưu và tìm self theo tài khoản", () => {
  assert.equal(buildCollapseStorageKey(7, 3), "cap2.tree.collapsed.7.3");
  assert.equal(buildCollapseStorageKey(null, null), "cap2.tree.collapsed.anon.default");
  assert.equal(resolveSelfPersonId({ person_id: 3 }, people), 3);
  assert.equal(resolveSelfPersonId({ account_id: 5 }, [{ id: 9, account_id: 5 }]), 9);
  assert.equal(resolveSelfPersonId({}, people), null);
});

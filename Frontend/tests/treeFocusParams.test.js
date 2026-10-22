import test from "node:test";
import assert from "node:assert/strict";

import { buildTreeFocusUrl, isTreePath, parseTreeFocusParams, treePathForRole } from "../src/features/genealogy/utils/treeFocusParams.js";

test("parseTreeFocusParams đọc focus và highlight", () => {
  assert.deepEqual(parseTreeFocusParams("?focus=5&highlight=5,7,9"), { focus: 5, highlight: [5, 7, 9] });
});

test("parseTreeFocusParams bỏ giá trị sai và trùng", () => {
  assert.deepEqual(parseTreeFocusParams("?focus=abc&highlight=3,x,3,-1,4"), { focus: 3, highlight: [3, 4] });
  assert.deepEqual(parseTreeFocusParams("?focus=8"), { focus: 8, highlight: [8] });
  assert.equal(parseTreeFocusParams("?foo=1"), null);
  assert.equal(parseTreeFocusParams(""), null);
});

test("buildTreeFocusUrl chọn route theo vai trò", () => {
  assert.equal(buildTreeFocusUrl("member", [4, 6]), "/user/family-tree?focus=4&highlight=4%2C6");
  assert.equal(buildTreeFocusUrl("manager", [4]), "/manager/genealogy?focus=4&highlight=4");
  assert.equal(buildTreeFocusUrl("member", []), null);
  assert.equal(treePathForRole("admin"), "/manager/genealogy");
  assert.ok(isTreePath("/user/family-tree"));
  assert.ok(!isTreePath("/user/posts"));
});

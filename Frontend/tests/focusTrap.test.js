import test from "node:test";
import assert from "node:assert/strict";
import { nextFocusIndex } from "../src/shared/utils/focusTrap.js";

test("nextFocusIndex xoay vòng khi Tab", () => {
  assert.equal(nextFocusIndex(3, 0, false), 1);
  assert.equal(nextFocusIndex(3, 2, false), 0);
});

test("nextFocusIndex xoay vòng khi Shift+Tab", () => {
  assert.equal(nextFocusIndex(3, 1, true), 0);
  assert.equal(nextFocusIndex(3, 0, true), 2);
});

test("nextFocusIndex xử lý focus ngoài hộp thoại và danh sách rỗng", () => {
  assert.equal(nextFocusIndex(3, -1, false), 0);
  assert.equal(nextFocusIndex(3, -1, true), 2);
  assert.equal(nextFocusIndex(0, -1, false), -1);
});

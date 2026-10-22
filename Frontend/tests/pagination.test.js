import test from "node:test";
import assert from "node:assert/strict";

import { appendPage, nextCursorOf, refreshHead } from "../src/shared/utils/pagination.js";

test("nextCursorOf chỉ trả con trỏ khi còn trang sau", () => {
  assert.equal(nextCursorOf({ has_more: true, next_before_id: 12 }), 12);
  assert.equal(nextCursorOf({ has_more: false, next_before_id: 12 }), null);
  assert.equal(nextCursorOf({ has_more: true }), null);
  assert.equal(nextCursorOf(null), null);
});

test("appendPage nối trang cũ hơn và bỏ trùng id", () => {
  const merged = appendPage([{ id: 5 }, { id: 4 }], [{ id: 4 }, { id: 3 }]);
  assert.deepEqual(merged.map((item) => item.id), [5, 4, 3]);
  assert.deepEqual(appendPage(undefined, [{ id: 1 }]).map((item) => item.id), [1]);
});

test("refreshHead đưa mục mới lên đầu và giữ các trang đã tải thêm", () => {
  const current = [{ id: 5, is_read: 1 }, { id: 4 }, { id: 3 }, { id: 2 }];
  const merged = refreshHead(current, [{ id: 6 }, { id: 5, is_read: 0 }, { id: 4 }]);
  assert.deepEqual(merged.map((item) => item.id), [6, 5, 4, 3, 2]);
  assert.equal(merged[1].is_read, 0);
});

import test from "node:test";
import assert from "node:assert/strict";

import { pickUpcomingEvents, toIsoLocal, formatIsoShort } from "../src/features/posts/postAiHelpers.js";

const events = [
  { id: 3, title: "Họp họ", event_date: "2026-11-20", type: "meeting" },
  { id: "death-1-2026", title: "Giỗ cụ", date: "2026-11-05", type: "death_anniversary" },
  { id: "birthday-2-2026", title: "Sinh nhật", date: "2026-11-06", type: "birthday" },
  { id: 9, title: "Đã qua", event_date: "2026-10-01", type: "meeting" },
  { id: 3, title: "Trùng", event_date: "2026-11-20", type: "meeting" },
];

test("lọc sự kiện sắp tới, bỏ sinh nhật và trùng, sắp theo ngày", () => {
  const result = pickUpcomingEvents(events, "2026-10-30");
  assert.deepEqual(result.map((e) => e.id), ["death-1-2026", "3"]);
});

test("giới hạn số lượng và chịu được dữ liệu sai", () => {
  assert.equal(pickUpcomingEvents(events, "2026-10-30", 1).length, 1);
  assert.deepEqual(pickUpcomingEvents(null, "2026-10-30"), []);
});

test("định dạng ngày", () => {
  assert.equal(toIsoLocal(new Date(2026, 10, 5)), "2026-11-05");
  assert.equal(formatIsoShort("2026-11-05"), "05/11/2026");
});

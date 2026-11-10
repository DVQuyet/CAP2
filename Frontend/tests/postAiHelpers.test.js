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

test("nút soạn thông báo từ lịch: bỏ lịch hệ thống, sinh nhật và sự kiện đã qua", async () => {
  const { canDraftAnnouncement, postsPathFromCalendarPath } = await import("../src/features/posts/postAiHelpers.js");
  const today = "2026-10-30";
  assert.equal(canDraftAnnouncement({ id: "death-1-2026", type: "death_anniversary", date: "2026-11-05" }, today), true);
  assert.equal(canDraftAnnouncement({ id: 7, type: "meeting", event_date: "2026-10-30" }, today), true);
  assert.equal(canDraftAnnouncement({ id: "solar-1", type: "holiday", source: "system", date: "2026-11-05" }, today), false);
  assert.equal(canDraftAnnouncement({ id: 2, type: "birthday", date: "2026-11-05" }, today), false);
  assert.equal(canDraftAnnouncement({ id: 3, type: "meeting", date: "2026-10-01" }, today), false);
  assert.equal(postsPathFromCalendarPath("/manager/calendar"), "/manager/posts");
  assert.equal(postsPathFromCalendarPath("/user/calendar"), "/user/posts");
  assert.equal(postsPathFromCalendarPath("/dashboard/calendar"), "");
});

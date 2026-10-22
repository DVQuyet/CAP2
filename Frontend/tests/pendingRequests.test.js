import test from "node:test";
import assert from "node:assert/strict";
import { createPendingTracker } from "../src/services/pendingRequests.js";

function fakeTimers() {
  let next = 1;
  const timers = new Map();
  return {
    setTimer: (fn) => { const id = next++; timers.set(id, fn); return id; },
    clearTimer: (id) => timers.delete(id),
    fire: () => { const all = [...timers.values()]; timers.clear(); all.forEach((fn) => fn()); },
    count: () => timers.size,
  };
}

test("becomes slow only after the threshold fires while a request is pending", () => {
  const t = fakeTimers();
  const tracker = createPendingTracker({ setTimer: t.setTimer, clearTimer: t.clearTimer });
  const seen = [];
  tracker.subscribe((slow) => seen.push(slow));
  const end = tracker.begin();
  assert.equal(tracker.isSlow(), false);
  t.fire();
  assert.equal(tracker.isSlow(), true);
  end();
  assert.equal(tracker.isSlow(), false);
  assert.deepEqual(seen, [true, false]);
});

test("fast requests never trigger the banner and cancel the timer", () => {
  const t = fakeTimers();
  const tracker = createPendingTracker({ setTimer: t.setTimer, clearTimer: t.clearTimer });
  const end = tracker.begin();
  end();
  assert.equal(t.count(), 0);
  t.fire();
  assert.equal(tracker.isSlow(), false);
});

test("stays slow until every pending request finishes; end is idempotent", () => {
  const t = fakeTimers();
  const tracker = createPendingTracker({ setTimer: t.setTimer, clearTimer: t.clearTimer });
  const a = tracker.begin();
  const b = tracker.begin();
  t.fire();
  a();
  a();
  assert.equal(tracker.isSlow(), true);
  assert.equal(tracker.getPending(), 1);
  b();
  assert.equal(tracker.isSlow(), false);
  assert.equal(tracker.getPending(), 0);
});

import test from "node:test";
import assert from "node:assert/strict";
import { SLOW_LOADING_MS, slowLoadingHintKey } from "../src/shared/utils/slowLoading.js";
import { routeErrorResetKey } from "../src/shared/utils/routeError.js";

test("slowLoadingHintKey is empty before the threshold and set after", () => {
  assert.equal(slowLoadingHintKey(0), "");
  assert.equal(slowLoadingHintKey(SLOW_LOADING_MS - 1), "");
  assert.equal(slowLoadingHintKey(SLOW_LOADING_MS), "common.states.coldStart");
  assert.equal(slowLoadingHintKey(60000), "common.states.coldStart");
});

test("slowLoadingHintKey ignores invalid input and honours a custom threshold", () => {
  assert.equal(slowLoadingHintKey(NaN), "");
  assert.equal(slowLoadingHintKey(undefined), "");
  assert.equal(slowLoadingHintKey(1500, 1000), "common.states.coldStart");
});

test("routeErrorResetKey changes with the path but not with unrelated state", () => {
  assert.equal(routeErrorResetKey({ pathname: "/a", search: "?x=1" }), "/a?x=1");
  assert.notEqual(routeErrorResetKey({ pathname: "/a" }), routeErrorResetKey({ pathname: "/b" }));
  assert.equal(routeErrorResetKey(null), "");
});

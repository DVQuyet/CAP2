import test from "node:test";
import assert from "node:assert/strict";
import {
  getTokenExpiry,
  isTokenExpired,
  shouldRedirectToLogin,
  safeRedirectPath,
  buildLoginRedirect,
} from "../src/shared/utils/sessionExpiry.js";

function makeToken(payload) {
  const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString("base64url");
  return `${b64({ alg: "HS256" })}.${b64(payload)}.sig`;
}

test("getTokenExpiry reads exp and tolerates garbage", () => {
  assert.equal(getTokenExpiry(makeToken({ exp: 123 })), 123);
  assert.equal(getTokenExpiry("abc"), null);
  assert.equal(getTokenExpiry(""), null);
  assert.equal(getTokenExpiry(makeToken({ id: 1 })), null);
});

test("isTokenExpired compares exp with now", () => {
  const now = 1_000_000_000_000;
  assert.equal(isTokenExpired(makeToken({ exp: now / 1000 - 10 }), now), true);
  assert.equal(isTokenExpired(makeToken({ exp: now / 1000 + 10 }), now), false);
  assert.equal(isTokenExpired("not-a-jwt", now), false);
});

test("shouldRedirectToLogin decisions", () => {
  const base = { status: 403, data: { code: "TOKEN_INVALID" }, hadToken: true, url: "/api/admin/stats", pathname: "/admin/dashboard" };
  assert.equal(shouldRedirectToLogin(base), true);
  assert.equal(shouldRedirectToLogin({ ...base, status: 401, data: {} }), true);
  assert.equal(shouldRedirectToLogin({ ...base, status: 403, data: { code: "FORBIDDEN" } }), false);
  assert.equal(shouldRedirectToLogin({ ...base, status: 500 }), false);
  assert.equal(shouldRedirectToLogin({ ...base, hadToken: false }), false);
  assert.equal(shouldRedirectToLogin({ ...base, url: "/api/auth/login" }), false);
  assert.equal(shouldRedirectToLogin({ ...base, pathname: "/login" }), false);
  assert.equal(shouldRedirectToLogin({ ...base, pathname: "/register" }), false);
});

test("safeRedirectPath only accepts same-origin relative paths", () => {
  assert.equal(safeRedirectPath("/admin/dashboard?x=1"), "/admin/dashboard?x=1");
  assert.equal(safeRedirectPath("//evil.com"), null);
  assert.equal(safeRedirectPath("https://evil.com"), null);
  assert.equal(safeRedirectPath("/\\evil.com"), null);
  assert.equal(safeRedirectPath("/login"), null);
  assert.equal(safeRedirectPath(null), null);
});

test("buildLoginRedirect encodes current path", () => {
  assert.equal(buildLoginRedirect("/admin/dashboard", "?a=1"), "/login?redirect=%2Fadmin%2Fdashboard%3Fa%3D1");
  assert.equal(buildLoginRedirect("/login", ""), "/login");
});

import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import {
  PASSWORD_MIN_LENGTH,
  passwordPolicyIssue,
  passwordPolicyMessage,
  assertPasswordPolicy,
} from "../src/shared/utils/passwordPolicy.js";

const require = createRequire(import.meta.url);
const backend = require("../../Backend/src/shared/validation/passwordPolicy.js");
const vi = JSON.parse(readFileSync(new URL("../src/i18n/locales/vi.json", import.meta.url), "utf8"));
const en = JSON.parse(readFileSync(new URL("../src/i18n/locales/en.json", import.meta.url), "utf8"));
const t = (key, vars) => `${key}${vars ? `|${vars.min}` : ""}`;

const CASES = [
  ["", {}],
  ["a", {}],
  ["abc1234", {}],
  ["abcdefgh", {}],
  ["12345678", {}],
  ["abcd1234", {}],
  ["mậtkhẩu1", {}],
  ["x".repeat(130) + "1", {}],
  ["NguyenVan1990", { email: "nguyenvan1990@example.com" }],
  ["nguyenvan1990@example.com", { email: "NguyenVan1990@Example.com" }],
  ["nguyenvan1990x", { email: "nguyenvan1990@example.com" }],
];

test("quy tắc giao diện: 8 ký tự, có chữ và số, không trùng email", () => {
  assert.equal(PASSWORD_MIN_LENGTH, 8);
  assert.equal(passwordPolicyIssue("abc1234"), "too_short");
  assert.equal(passwordPolicyIssue("abcdefgh"), "needs_letter_and_digit");
  assert.equal(passwordPolicyIssue("abcd1234"), null);
  assert.equal(passwordPolicyIssue("Ba2026xx", { email: "ba2026xx@example.com" }), "same_as_identity");
});

test("giao diện và backend cho cùng kết quả trên cùng dữ liệu", () => {
  assert.equal(PASSWORD_MIN_LENGTH, backend.PASSWORD_MIN_LENGTH);
  for (const [password, identity] of CASES) {
    assert.equal(passwordPolicyIssue(password, identity), backend.passwordPolicyIssue(password, identity), password);
  }
});

test("câu lỗi lấy từ i18n; vi.json và en.json có đủ khóa cho mọi lý do", () => {
  assert.equal(passwordPolicyMessage(t, "abcd1234"), null);
  assert.equal(passwordPolicyMessage(t, "abc"), "shared.passwordPolicy.too_short|8");
  assert.throws(() => assertPasswordPolicy(t, "abcdefgh"), /shared\.passwordPolicy\.needs_letter_and_digit/);
  assert.doesNotThrow(() => assertPasswordPolicy(t, "abcd1234"));
  for (const reason of ["too_short", "too_long", "needs_letter_and_digit", "same_as_identity"]) {
    assert.ok(vi.shared.passwordPolicy[reason], `vi ${reason}`);
    assert.ok(en.shared.passwordPolicy[reason], `en ${reason}`);
  }
});

test("lỗi API WEAK_PASSWORD hiện câu i18n, không hiện câu tiếng Việt thô của server", async () => {
  const { weakPasswordErrorMessage } = await import("../src/shared/utils/passwordPolicy.js");
  const { friendlyErrorMessage } = await import("../src/shared/utils/friendlyError.js");
  const serverBody = { success: false, message: "Mật khẩu cần có cả chữ và số.", code: "WEAK_PASSWORD", reason: "needs_letter_and_digit" };
  // Kiểu lỗi của services/api.js, api/memberService.js, api/adminService.js: thân phản hồi nằm ở error.data.
  const apiError = Object.assign(new Error(serverBody.message), { status: 400, data: serverBody });
  assert.equal(weakPasswordErrorMessage(t, apiError), "shared.passwordPolicy.needs_letter_and_digit|8");
  assert.equal(weakPasswordErrorMessage(t, { code: "WEAK_PASSWORD", reason: "too_short" }), "shared.passwordPolicy.too_short|8");
  assert.equal(weakPasswordErrorMessage(t, { code: "WEAK_PASSWORD", reason: "la" }), null);
  assert.equal(weakPasswordErrorMessage(t, Object.assign(new Error("x"), { status: 400, data: { message: "x" } })), null);

  const origError = console.error;
  console.error = () => {};
  try {
    assert.equal(friendlyErrorMessage(apiError, t), "shared.passwordPolicy.needs_letter_and_digit|8");
    const other = Object.assign(new Error("Email đã tồn tại"), { status: 400, data: { message: "Email đã tồn tại" } });
    assert.equal(friendlyErrorMessage(other, t), "Email đã tồn tại");
  } finally {
    console.error = origError;
  }
});

test("không còn minLength viết thẳng hay kiểm độ dài 6 ở form mật khẩu", () => {
  const files = [
    "features/tree/components/FamilyTreeEditorParts/PersonInspector.jsx",
    "features/tree/components/FamilyTreeEditor.jsx",
    "features/admin/pages/MembersPage.jsx",
    "features/manager/pages/AccountPage.jsx",
  ];
  for (const file of files) {
    const text = readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8");
    assert.doesNotMatch(text, /minLength=\{\d+\}/, file);
    assert.doesNotMatch(text, /password\.length\s*[<>]=?\s*\d/i, file);
  }
});

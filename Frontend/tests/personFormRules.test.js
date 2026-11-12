import test from "node:test";
import assert from "node:assert/strict";

import {
  isBirthDateInFuture,
  parentChildAgeConstraintMessage,
  personFormError,
} from "../src/features/genealogy/utils/tree-editor/personFormRules.js";
import { motionMs } from "../src/features/genealogy/utils/tree-editor/treeFlash.js";

const t = (key, params) => (params ? `${key}:${JSON.stringify(params)}` : key);

test("tuổi cha mẹ so với con: trùng ngày, con lớn hơn, cha mẹ dưới 16 tuổi", () => {
  assert.equal(parentChildAgeConstraintMessage("1990-01-01", "1990-01-01", t), "tree.ageConstraint.sameBirth");
  assert.equal(parentChildAgeConstraintMessage("1980-01-01", "1990-01-01", t), "tree.ageConstraint.childOlder");
  assert.match(parentChildAgeConstraintMessage("2000-01-01", "1990-01-01", t), /parentTooYoung/);
  assert.equal(parentChildAgeConstraintMessage("2010-01-01", "1990-01-01", t), "");
  assert.equal(parentChildAgeConstraintMessage("", "1990-01-01", t), "");
});

test("form người: ngày sai và số điện thoại sai bị chặn", () => {
  assert.match(personFormError({ birth_date: "99/99/2000" }, t), /invalidDate/);
  assert.equal(personFormError({ birth_date: "1990", birth_date_precision: "year" }, t), "");
  assert.equal(personFormError({ phone: "abc" }, t), "tree.formErrors.invalidPhone");
  assert.equal(personFormError({ phone: "0912 345 678" }, t), "");
  assert.equal(isBirthDateInFuture("01/01/2999"), true);
  assert.equal(isBirthDateInFuture("01/01/1990"), false);
});

test("thời lượng hiệu ứng giữ nguyên khi không có window (không bật giảm chuyển động)", () => {
  assert.equal(motionMs(320), 320);
});

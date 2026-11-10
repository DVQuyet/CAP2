import test from "node:test";
import assert from "node:assert/strict";

import { buildCompareRows, normalizeReasons, removePairByKey } from "../src/features/duplicates/duplicateHelpers.js";

test("normalizeReasons bỏ mã lạ và đánh dấu điểm trừ", () => {
  const out = normalizeReasons([{ code: "name_exact", points: 50 }, { code: "birth_year_far", points: -25 }, { code: "x", points: 3 }, null]);
  assert.deepEqual(out, [
    { code: "name_exact", points: 50, negative: false },
    { code: "birth_year_far", points: -25, negative: true },
  ]);
  assert.deepEqual(normalizeReasons(undefined), []);
});

test("buildCompareRows đánh dấu dòng khác nhau", () => {
  const rows = buildCompareRows({ name: "A", birth: "năm 1940", father: null }, { name: "A", birth: "năm 1941", father: null });
  assert.equal(rows.find((r) => r.field === "name").differs, false);
  assert.equal(rows.find((r) => r.field === "birth").differs, true);
  assert.equal(rows.find((r) => r.field === "father").differs, false);
});

test("removePairByKey", () => {
  assert.deepEqual(removePairByKey([{ key: "1-2" }, { key: "3-4" }], "1-2"), [{ key: "3-4" }]);
});

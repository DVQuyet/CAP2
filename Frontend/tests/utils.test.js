import test from "node:test";
import assert from "node:assert/strict";

import { isoToVietnamDate, vietnamDateToIso, isValidVietnamDate } from "../src/shared/utils/dateFormat.js";
import { convertSolar2Lunar, convertLunar2Solar } from "../src/shared/utils/lunarCalendar.js";
import {
  buildFamilyIndexes,
  getAncestorIds,
  getDescendantIds,
} from "../src/features/genealogy/utils/treeFilter.js";
import { validateTreeData } from "../src/features/genealogy/utils/treeValidation.js";

test("đổi qua lại giữa ISO và dd/mm/yyyy", () => {
  assert.equal(isoToVietnamDate("2024-02-10"), "10/02/2024");
  assert.equal(vietnamDateToIso("10/02/2024"), "2024-02-10");
  assert.equal(isoToVietnamDate(""), "");
});

test("kiểm tra ngày không tồn tại trên lịch", () => {
  assert.equal(isValidVietnamDate("29/02/2024"), true);
  assert.equal(isValidVietnamDate("29/02/2023"), false);
});

test("mùng 1 Tết Giáp Thìn rơi vào 10/02/2024", () => {
  assert.deepEqual(convertSolar2Lunar(10, 2, 2024), { day: 1, month: 1, year: 2024, leap: 0 });
  assert.deepEqual(convertLunar2Solar(1, 1, 2024, 0), [10, 2, 2024]);
});

// Ông 1 + bà 2 -> cha 3 (+ mẹ 4) -> con 5
const people = [
  { id: 1, display_name: "Ông", gender: 1 },
  { id: 2, display_name: "Bà", gender: 2 },
  { id: 3, display_name: "Cha", gender: 1 },
  { id: 4, display_name: "Mẹ", gender: 2 },
  { id: 5, display_name: "Con", gender: 1 },
];
const families = [
  { id: 10, father_id: 1, mother_id: 2 },
  { id: 11, father_id: 3, mother_id: 4 },
];
const childRows = [
  { family_id: 10, person_id: 3 },
  { family_id: 11, person_id: 5 },
];

test("tổ tiên và hậu duệ theo đúng chiều quan hệ", () => {
  const indexes = buildFamilyIndexes(people, families, childRows);
  assert.deepEqual([...getAncestorIds(5, indexes)].sort(), [1, 2, 3, 4]);
  assert.deepEqual([...getDescendantIds(1, indexes)].sort(), [3, 5]);
  assert.deepEqual([...getAncestorIds(1, indexes)], []);
});

test("người có cả cha mẹ ruột và cha mẹ nuôi: tổ tiên gồm cả hai dòng", () => {
  // 5 là con ruột của (3,4) và con nuôi/thừa tự của (1,2); 3 là con của (1,2) nên 1,2 cũng là tổ tiên qua dòng ruột.
  const adoptivePeople = [...people, { id: 6, display_name: "Cha nuôi", gender: 1 }, { id: 7, display_name: "Mẹ nuôi", gender: 2 }];
  const adoptiveFamilies = [...families, { id: 12, father_id: 6, mother_id: 7 }];
  const adoptiveChildRows = [
    ...childRows,
    { family_id: 12, person_id: 5, child_type: "adopted", is_primary_lineage: 0 },
  ];
  const indexes = buildFamilyIndexes(adoptivePeople, adoptiveFamilies, adoptiveChildRows);
  assert.deepEqual([...getAncestorIds(5, indexes)].sort(), [1, 2, 3, 4, 6, 7]);
  assert.deepEqual([...getDescendantIds(6, indexes)], [5], "cha nuôi có con nuôi là hậu duệ");
  assert.equal(indexes.childFamiliesByPersonId.get(5).length, 2);
  assert.equal(indexes.childFamilyByPersonId.get(5).id, 11, "gia đình chính là cha mẹ ruột/dòng chính, không bị ghi đè bởi dòng đến sau");

  // Thứ tự dòng dữ liệu đảo ngược vẫn chọn đúng gia đình chính.
  const reversed = buildFamilyIndexes(adoptivePeople, adoptiveFamilies, [adoptiveChildRows[2], adoptiveChildRows[0], adoptiveChildRows[1]]);
  assert.equal(reversed.childFamilyByPersonId.get(5).id, 11);
  assert.deepEqual([...getAncestorIds(5, reversed)].sort(), [1, 2, 3, 4, 6, 7]);
});

test("vòng lặp cha mẹ không làm treo việc duyệt tổ tiên", () => {
  const loopFamilies = [
    { id: 20, father_id: 1, mother_id: null },
    { id: 21, father_id: 2, mother_id: null },
  ];
  const loopChildren = [
    { family_id: 20, person_id: 2 },
    { family_id: 21, person_id: 1 },
  ];
  const indexes = buildFamilyIndexes(people.slice(0, 2), loopFamilies, loopChildren);
  const ancestors = getAncestorIds(1, indexes);
  assert.ok(ancestors.has(2));
});

test("validateTreeData báo người thiếu tên", () => {
  const errors = validateTreeData([{ id: 9, gender: 1 }], [], []);
  assert.ok(errors.has(9));
  assert.ok(errors.get(9).some((message) => message.includes("Thiếu tên")));
});

import test from "node:test";
import assert from "node:assert/strict";

import { cardExtraInfo, cardMeta, genderKey, initialsOf, lifeYears } from "../src/features/tree/utils/tree-editor/treeCardInfo.js";

// Bộ dịch giả: trả về khóa kèm tham số để kiểm tra đúng chuỗi được chọn.
const t = (key, params) => (params ? `${key}:${Object.values(params).join(",")}` : key);

test("lifeYears: năm sinh – năm mất, chỉ lấy năm mất khi người đó đã mất", () => {
  assert.equal(lifeYears({ birth_date: "1920-03-12", death_date: "1990-08-01", is_living: 0 }), "1920 – 1990");
  assert.equal(lifeYears({ birth_date: "1948-01-02", death_date: null, is_living: 1 }), "1948");
  assert.equal(lifeYears({ birth_date: null, death_date: "1990-08-01", is_living: 0 }), "? – 1990");
  // Còn sống mà lỡ có ngày mất thì không hiện năm mất.
  assert.equal(lifeYears({ birth_date: "1950-01-01", death_date: "2000-01-01", is_living: 1 }), "1950");
  assert.equal(lifeYears({}), "");
});

test("cardMeta: một dòng gồm năm sinh – năm mất và đời, không có con thứ hay chi", () => {
  const person = { birth_date: "1975-03-03", is_living: 1, generation: 3, child_order: 1, branch: "Giáp" };
  assert.equal(cardMeta(person, t), "1975 · tree.card.generation:3");
  assert.equal(cardMeta({ generation: 2 }, t), "tree.card.generation:2");
  assert.equal(cardMeta({}, t), "");
});

test("cardExtraInfo: con thứ, chi và đã mất nằm ở tooltip", () => {
  assert.deepEqual(
    cardExtraInfo({ child_order: 2, branch: "Giáp", is_living: 0 }, t),
    ["tree.card.childOrder:2", "tree.card.branch:Giáp", "tree.card.deceased"],
  );
  assert.deepEqual(cardExtraInfo({ child_sort_order: 0, is_living: 1 }, t), []);
});

test("initialsOf lấy chữ cái đầu của tên gọi (từ cuối), giữ dấu tiếng Việt", () => {
  assert.equal(initialsOf("Nguyễn Văn Đức"), "Đ");
  assert.equal(initialsOf("  lê thị ánh "), "Á");
  assert.equal(initialsOf(""), "?");
});

test("genderKey", () => {
  assert.equal(genderKey({ gender: 1 }), "male");
  assert.equal(genderKey({ gender: "2" }), "female");
  assert.equal(genderKey({}), "unknown");
});

// Chuẩn hóa người và các quy tắc thứ tự (anh chị em, người cùng đời). Hàm thuần.
import { vietnamDateToIso } from "../../../shared/utils/dateFormat.js";
import { asArray, toInt } from "./geometry.js";

export const birthTime = (person) => {
  const text = vietnamDateToIso(person?.birth_date);
  if (!text) return null;
  const time = Date.parse(text);
  return Number.isFinite(time) ? time : null;
};

export const normalizePerson = (person) => ({
  ...person,
  id: Number(person.id),
  account_id: person.account_id == null ? null : Number(person.account_id),
  role_id: person.role_id == null ? null : Number(person.role_id),
  tree_x: toInt(person.tree_x, 0),
  tree_y: toInt(person.tree_y, 0),
  display_order: toInt(person.display_order, 0),
  generation: toInt(person.generation, 1) || 1,
});

export function personSort(a, b) {
  const aBirth = birthTime(a);
  const bBirth = birthTime(b);
  if (aBirth != null && bBirth != null && aBirth !== bBirth) return aBirth - bBirth;
  const orderDiff = toInt(a?.display_order, 0) - toInt(b?.display_order, 0);
  if (orderDiff) return orderDiff;
  return toInt(a?.tree_x, 0) - toInt(b?.tree_x, 0) || Number(a?.id || 0) - Number(b?.id || 0);
}

// So hai dòng con cái dạng { person, sort_order }.
export function siblingSort(a, b) {
  const aBirth = birthTime(a?.person);
  const bBirth = birthTime(b?.person);
  if (aBirth != null && bBirth != null && aBirth !== bBirth) return aBirth - bBirth;

  const orderDiff = toInt(a?.sort_order, 0) - toInt(b?.sort_order, 0);
  if (orderDiff) return orderDiff;

  return personSort(a?.person || {}, b?.person || {});
}

const PRECISE_ENOUGH = new Set(["exact", "month", "year"]);
const childPersonOf = (item) => item?.person || item;

// Thứ tự anh chị em khi sắp xếp cây: ngày sinh khi đủ chính xác và khác nhau, rồi "con thứ" (sort_order), rồi id.
// Không đẩy người đã có gia đình lên trước: giữ đúng thứ tự trưởng - thứ.
export function sortChildrenForFamily(children = []) {
  return asArray(children)
    .slice()
    .sort((a, b) => {
      const personA = childPersonOf(a) || {};
      const personB = childPersonOf(b) || {};
      const preciseA = PRECISE_ENOUGH.has(String(personA.birth_date_precision || "exact"));
      const preciseB = PRECISE_ENOUGH.has(String(personB.birth_date_precision || "exact"));
      const birthA = preciseA ? birthTime(personA) : null;
      const birthB = preciseB ? birthTime(personB) : null;
      if (birthA != null && birthB != null && birthA !== birthB) return birthA - birthB;

      const orderA = toInt(a?.sort_order ?? a?.sortOrder, 0);
      const orderB = toInt(b?.sort_order ?? b?.sortOrder, 0);
      if (orderA > 0 && orderB > 0 && orderA !== orderB) return orderA - orderB;
      if (birthA != null && birthB == null) return -1;
      if (birthA == null && birthB != null) return 1;

      return Number(personA.id || 0) - Number(personB.id || 0) || personSort(personA, personB);
    });
}

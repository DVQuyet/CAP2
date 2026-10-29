// Gợi ý người trùng lặp: nhãn lý do và so sánh từng dòng để tô khác biệt.
export const REASON_CODES = [
  "name_exact", "name_typo", "name_similar", "same_gender", "birth_year_same", "birth_date_same",
  "birth_year_close", "birth_year_far", "death_year_far", "same_parents", "shared_parent", "similar_parents",
  "same_generation", "generation_far",
];

// Chỉ giữ mã lý do đã biết (có chuỗi i18n); điểm âm là điểm trừ.
export function normalizeReasons(reasons) {
  return (Array.isArray(reasons) ? reasons : [])
    .filter((reason) => reason && REASON_CODES.includes(reason.code))
    .map((reason) => ({ code: reason.code, points: Number(reason.points) || 0, negative: Number(reason.points) < 0 }));
}

// Các dòng so sánh cạnh nhau; differs = hai giá trị khác nhau.
export function buildCompareRows(a = {}, b = {}) {
  const fields = ["name", "gender", "generation", "birth", "death", "father", "mother"];
  return fields.map((field) => {
    const left = a[field] ?? null;
    const right = b[field] ?? null;
    return { field, left, right, differs: left !== right };
  });
}

export function removePairByKey(pairs, key) {
  return (Array.isArray(pairs) ? pairs : []).filter((pair) => pair.key !== key);
}

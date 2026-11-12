// Thông tin hiển thị trên thẻ của cây gia phả (hàm thuần, dùng chung cho thẻ một người và thẻ vợ chồng).
export function yearOf(value) {
  const match = String(value || "").match(/\d{4}/);
  return match ? match[0] : "";
}

export function lifeYears(person) {
  const birth = yearOf(person?.birth_date);
  const death = Number(person?.is_living) === 0 ? yearOf(person?.death_date) : "";
  if (birth && death) return `${birth} – ${death}`;
  if (death) return `? – ${death}`;
  return birth;
}

// Chữ cái đầu của tên gọi (từ cuối trong họ tên tiếng Việt).
export function initialsOf(name) {
  const words = String(name || "").trim().split(/\s+/).filter(Boolean);
  const last = words[words.length - 1] || "";
  return last.charAt(0).toUpperCase() || "?";
}

export function genderKey(person) {
  const gender = Number(person?.gender);
  if (gender === 1) return "male";
  if (gender === 2) return "female";
  return "unknown";
}

// Dòng phụ của thẻ: "năm sinh – năm mất · Đời N". Con thứ và chi nằm ở bảng chi tiết và tooltip.
export function cardMeta(person, t) {
  return [
    lifeYears(person),
    person?.generation ? t("tree.card.generation", { count: person.generation }) : "",
  ].filter(Boolean).join(" · ");
}

// Thông tin không hiện trên thẻ nhưng vẫn cần cho tooltip và trình đọc màn hình.
export function cardExtraInfo(person, t) {
  const childOrder = Number(person?.child_order || person?.child_sort_order);
  return [
    Number.isFinite(childOrder) && childOrder > 0 ? t("tree.card.childOrder", { count: childOrder }) : "",
    person?.branch ? t("tree.card.branch", { name: person.branch }) : "",
    Number(person?.is_living) === 0 ? t("tree.card.deceased") : "",
  ].filter(Boolean);
}

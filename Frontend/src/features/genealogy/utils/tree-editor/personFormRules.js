// Kiểm tra dữ liệu form người trên cây (ngày sinh/mất, số điện thoại, tuổi cha mẹ so với con). Hàm thuần.
import { vietnamDateToIso } from "../../../../shared/utils/dateFormat.js";

const todayIsoDate = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

// Kiểm tra form người: ngày nhập sai (vd 99/99/2000) không được lưu im lặng thành rỗng; số điện thoại hợp lệ.
const PHONE_PATTERN = /^\+?[0-9 .-]{8,15}$/;
export const personFormError = (form, t) => {
  for (const [field, label] of [["birth_date", "birthDate"], ["death_date", "deathDate"]]) {
    const text = String(form?.[field] || "").trim();
    const yearOnly = ["year", "approximate", "unknown"].includes(form?.[`${field.replace("_date", "")}_date_precision`]);
    if (text && !yearOnly && !vietnamDateToIso(text)) {
      return t("tree.formErrors.invalidDate", { field: t(`tree.inspector.fields.${label}`) });
    }
  }
  const phone = String(form?.phone || "").trim();
  if (phone && !PHONE_PATTERN.test(phone)) return t("tree.formErrors.invalidPhone");
  return "";
};

export const isBirthDateInFuture = (birthDate) => {
  const birthIso = vietnamDateToIso(birthDate);
  return Boolean(birthIso && birthIso > todayIsoDate());
};

const isoDateOnlyValue = (value) => {
  const converted = vietnamDateToIso(value);
  if (converted) return converted;
  const text = String(value || "").trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
};

const addYearsToIsoDate = (value, years) => {
  const iso = isoDateOnlyValue(value);
  if (!iso) return "";
  const [year, month, day] = iso.split("-").map(Number);
  const target = new Date(Date.UTC(year + years, month - 1, day));
  return Number.isNaN(target.getTime()) ? "" : target.toISOString().slice(0, 10);
};

export const parentChildAgeConstraintMessage = (childBirthDate, parentBirthDate, t) => {
  const childBirth = isoDateOnlyValue(childBirthDate);
  const parentBirth = isoDateOnlyValue(parentBirthDate);
  if (!childBirth || !parentBirth) return "";

  if (childBirth === parentBirth) {
    return t("tree.ageConstraint.sameBirth");
  }

  if (childBirth < parentBirth) {
    return t("tree.ageConstraint.childOlder");
  }

  const minChildBirth = addYearsToIsoDate(parentBirth, 16);
  if (minChildBirth && childBirth < minChildBirth) {
    return t("tree.ageConstraint.parentTooYoung", { years: 16 });
  }

  return "";
};

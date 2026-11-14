import { formatDateVN, isoToVietnamDate } from "../../../../shared/utils/dateFormat";
import { historicalFieldsFromPerson } from "./historicalDates";

export { asArray, clamp, snap, snapLine, toInt } from "../../model/geometry.js";
export { birthTime, normalizePerson, personSort, siblingSort } from "../../model/personOrder.js";

export function readCurrentAccount() {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem("auth_user") || window.localStorage.getItem("user");
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export const dateInput = (value) => isoToVietnamDate(value);

export const formatDisplayDate = (value) => formatDateVN(value);

export const fullName = (person, fallback) =>
  person?.display_name ||
  [person?.surname, person?.middle_name, person?.first_name].filter(Boolean).join(" ").trim() ||
  fallback;

export function personIdentityKey(person) {
  const accountId = Number(person?.account_id);
  return Number.isFinite(accountId) && accountId > 0 ? `account:${accountId}` : `person:${Number(person?.id)}`;
}

export function personToForm(person) {
  return {
    display_name: person?.display_name || "",
    surname: person?.surname || "",
    middle_name: person?.middle_name || "",
    first_name: person?.first_name || "",
    gender: person?.gender == null ? "" : String(person.gender),
    // Ngày sinh/mất (độ chính xác, âm/dương lịch), tình trạng còn sống/không rõ, ngày giỗ, nguồn dữ liệu.
    ...historicalFieldsFromPerson(person),
    role_id: person?.role_id == null ? "" : String(person.role_id),
    generation: person?.generation != null ? String(person.generation) : "1",
    child_order: person?.child_order || person?.child_sort_order || "",
    branch: person?.branch != null ? String(person.branch) : "",
    hometown: person?.hometown || "",
    address: person?.address || "",
    phone: person?.phone || "",
    email: person?.email || "",
    account_email: person?.account_email || "",
    account_password: "",
    avatar_url: person?.avatar_url || "",
    bio: person?.bio || "",
    note: person?.note || "",
  };
}

export function extractCreatedPersonId(response) {
  const candidates = [
    response?.id,
    response?.person_id,
    response?.person?.id,
    response?.data?.id,
    response?.data?.person_id,
    response?.data?.person?.id,
    response?.result?.id,
    response?.result?.person_id,
    response?.result?.person?.id,
  ];

  for (const value of candidates) {
    const id = Number(value);
    if (Number.isFinite(id) && id > 0) return id;
  }

  return null;
}

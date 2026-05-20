import { formatDateVN, isoToVietnamDate, vietnamDateToIso } from "../../../../shared/utils/dateFormat";
import { LINE_SNAP_SIZE, SNAP_SIZE } from "./treeConstants";

export const toInt = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : fallback;
};

export const snap = (value) => Math.round(toInt(value, 0) / SNAP_SIZE) * SNAP_SIZE;

export const snapLine = (value) => Math.round(toInt(value, 0) / LINE_SNAP_SIZE) * LINE_SNAP_SIZE;

export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export const asArray = (value) => (Array.isArray(value) ? value : []);

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

export const birthTime = (person) => {
  const text = vietnamDateToIso(person?.birth_date);
  if (!text) return null;
  const time = Date.parse(text);
  return Number.isFinite(time) ? time : null;
};

export const fullName = (person, fallback) =>
  person?.display_name ||
  [person?.surname, person?.middle_name, person?.first_name].filter(Boolean).join(" ").trim() ||
  fallback;

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

export function personIdentityKey(person) {
  const accountId = Number(person?.account_id);
  return Number.isFinite(accountId) && accountId > 0 ? `account:${accountId}` : `person:${Number(person?.id)}`;
}

export function personSort(a, b) {
  const aBirth = birthTime(a);
  const bBirth = birthTime(b);
  if (aBirth != null && bBirth != null && aBirth !== bBirth) return aBirth - bBirth;
  const orderDiff = toInt(a?.display_order, 0) - toInt(b?.display_order, 0);
  if (orderDiff) return orderDiff;
  return toInt(a?.tree_x, 0) - toInt(b?.tree_x, 0) || Number(a?.id || 0) - Number(b?.id || 0);
}

export function siblingSort(a, b) {
  const aBirth = birthTime(a?.person);
  const bBirth = birthTime(b?.person);
  if (aBirth != null && bBirth != null && aBirth !== bBirth) return aBirth - bBirth;

  const orderDiff = toInt(a?.sort_order, 0) - toInt(b?.sort_order, 0);
  if (orderDiff) return orderDiff;

  return personSort(a?.person || {}, b?.person || {});
}

export function personToForm(person) {
  return {
    display_name: person?.display_name || "",
    surname: person?.surname || "",
    middle_name: person?.middle_name || "",
    first_name: person?.first_name || "",
    gender: person?.gender == null ? "" : String(person.gender),
    birth_date: dateInput(person?.birth_date),
    death_date: dateInput(person?.death_date),
    is_living: Number(person?.is_living) === 0 ? "0" : "1",
    role_id: person?.role_id == null ? "" : String(person.role_id),
    generation: person?.generation != null ? String(person.generation) : "1",
    branch: person?.branch != null ? String(person.branch) : "",
    hometown: person?.hometown || "",
    address: person?.address || "",
    phone: person?.phone || "",
    email: person?.email || "",
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

import { formatDateTimeVN, formatDateVN } from "../../../shared/utils/dateFormat";
export const asArray = (value) => (Array.isArray(value) ? value : []);

export const fullName = (item, fallback = "N/A") =>
  item?.display_name ||
  [item?.surname, item?.middle_name, item?.first_name].filter(Boolean).join(" ").trim() ||
  item?.email ||
  fallback;

export const personName = (person) => fullName(person, "Member");

export const avatarInitial = (item) => fullName(item).charAt(0).toUpperCase();

export const formatDate = (value) => {
  if (!value) return "N/A";
  return formatDateVN(value);
};

export const formatDateTime = (value) => {
  if (!value) return "N/A";
  return formatDateTimeVN(value);
};

export const compactPayload = (form) =>
  Object.fromEntries(
    Object.entries(form).map(([key, value]) => [key, typeof value === "string" ? value.trim() : value])
  );

export const yearOf = (value) => {
  if (!value) return "";
  const text = String(value);
  return text.length >= 4 ? text.slice(0, 4) : text;
};

export const mapTreeNode = (node) => ({
  id: node.person.id,
  person_id: node.person.id,
  account_id: node.person.account_id,
  name: personName(node.person),
  title: node.spouse ? `Spouse: ${personName(node.spouse)}` : node.person.hometown || "N/A",
  generation: `Gen ${node.person.generation || "?"}`,
  birth: yearOf(node.person.birth_date),
  death: yearOf(node.person.death_date),
  raw: node.person,
  children: (node.children || []).map(mapTreeNode),
});

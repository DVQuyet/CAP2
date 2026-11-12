const asArray = (value) => (Array.isArray(value) ? value : []);

const toId = (value) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
};

const isoDateOnly = (value) => {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  const text = String(value).trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
};

const addYearsToIsoDate = (value, years) => {
  const text = isoDateOnly(value);
  if (!text) return null;
  const [year, month, day] = text.split("-").map(Number);
  const target = new Date(Date.UTC(year + years, month - 1, day));
  return Number.isNaN(target.getTime()) ? null : target.toISOString().slice(0, 10);
};

const todayIsoDate = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const birthDateFutureMessage = (person) => {
  const birth = isoDateOnly(person?.birth_date);
  if (!birth) return null;
  return birth > todayIsoDate() ? "Ngày sinh không được lớn hơn ngày hiện tại." : null;
};

const parentChildAgeGapMessage = (child, parent) => {
  const childBirth = isoDateOnly(child?.birth_date);
  const parentBirth = isoDateOnly(parent?.birth_date);
  if (!childBirth || !parentBirth) return null;

  if (childBirth === parentBirth) {
    return "Cha/mẹ và con không được có cùng ngày tháng năm sinh.";
  }

  if (childBirth < parentBirth) {
    return "Ngày sinh của con phải nhỏ hơn của cha mẹ.";
  }

  const minChildBirth = addYearsToIsoDate(parentBirth, 16);
  if (!minChildBirth || childBirth >= minChildBirth) return null;

  return "Cha/mẹ phải lớn hơn con ít nhất 16 tuổi.";
};

function add(errors, personId, message) {
  const id = toId(personId);
  if (!id) return;
  if (!errors.has(id)) errors.set(id, []);
  errors.get(id).push(message);
}

export function validateTreeData(people = [], families = [], childRows = []) {
  const errors = new Map();
  const peopleById = new Map(asArray(people).map((person) => [Number(person.id), person]));
  const familyById = new Map(asArray(families).map((family) => [Number(family.id), family]));

  asArray(people).forEach((person) => {
    const name = person?.display_name || [person?.surname, person?.middle_name, person?.first_name].filter(Boolean).join(" ").trim();
    if (!String(name || "").trim()) add(errors, person.id, "Thiếu tên");
    if (![1, 2].includes(Number(person.gender))) add(errors, person.id, "Thiếu hoặc sai giới tính");
    if (Number(person.is_living) !== 0 && !toId(person.account_id)) add(errors, person.id, "Chưa liên kết tài khoản");
    const futureBirth = birthDateFutureMessage(person);
    if (futureBirth) add(errors, person.id, futureBirth);
  });

  const childParentPairs = new Set();
  asArray(families).forEach((family) => {
    const father = peopleById.get(Number(family.father_id));
    const mother = peopleById.get(Number(family.mother_id));
    if (father && Number(father.gender) !== 1) add(errors, father.id, "Người đang ở vai trò cha nhưng giới tính không phải nam");
    if (mother && Number(mother.gender) !== 2) add(errors, mother.id, "Người đang ở vai trò mẹ nhưng giới tính không phải nữ");
  });

  asArray(childRows).forEach((row) => {
    const family = familyById.get(Number(row.family_id));
    const child = peopleById.get(Number(row.person_id));
    if (!family || !child) return;
    [family.father_id, family.mother_id].filter(Boolean).forEach((parentId) => {
      const parent = peopleById.get(Number(parentId));
      const key = `${Number(parentId)}:${Number(child.id)}`;
      if (childParentPairs.has(key)) add(errors, child.id, "Trùng quan hệ cha/mẹ - con");
      childParentPairs.add(key);
      const ageGapMessage = parentChildAgeGapMessage(child, parent);
      if (ageGapMessage) add(errors, child.id, ageGapMessage);
    });
  });

  const graph = new Map();
  childParentPairs.forEach((pair) => {
    const [parentId, childId] = pair.split(":").map(Number);
    if (!graph.has(parentId)) graph.set(parentId, []);
    graph.get(parentId).push(childId);
  });
  const visiting = new Set();
  const visited = new Set();
  const dfs = (id, path = []) => {
    if (visiting.has(id)) {
      path.concat(id).forEach((nodeId) => add(errors, nodeId, "Có vòng lặp quan hệ"));
      return;
    }
    if (visited.has(id)) return;
    visiting.add(id);
    asArray(graph.get(id)).forEach((nextId) => dfs(nextId, path.concat(id)));
    visiting.delete(id);
    visited.add(id);
  };
  asArray(people).forEach((person) => dfs(Number(person.id)));

  return errors;
}

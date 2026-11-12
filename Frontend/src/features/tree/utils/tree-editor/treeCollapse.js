import { buildFamilyIndexes, getAncestorIds } from "../treeFilter.js";

// Logic thuần cho thu gọn/mở rộng nhánh cây: không đụng dữ liệu hay bố cục thủ công đã lưu.
// "collapsed" = người có nhánh con cháu bị ẩn; "hiddenAncestors" = người bị ẩn vì ở đời trên cửa sổ hiển thị.

const asArray = (value) => (Array.isArray(value) ? value : []);
const toId = (value) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
};

export const DEFAULT_ANCESTOR_GENERATIONS = 1;
export const DEFAULT_DESCENDANT_GENERATIONS = 2;
export const DEFAULT_FOUNDER_GENERATIONS = 3;

export function buildCollapseStorageKey(accountId, clanId) {
  return `cap2.tree.collapsed.${accountId || "anon"}.${clanId || "default"}`;
}

export function resolveSelfPersonId(account, people = []) {
  const list = asArray(people);
  const personId = toId(account?.person_id ?? account?.personId);
  if (personId && list.some((person) => Number(person.id) === personId)) return personId;
  const accountId = toId(account?.account_id ?? account?.accountId ?? account?.id);
  if (!accountId) return null;
  const matched = list.find((person) => Number(person.account_id) === accountId);
  return matched ? Number(matched.id) : null;
}

// Đời của từng người: người có cha mẹ = 1 + đời lớn nhất của cha mẹ; người không có cha mẹ lấy đời của vợ/chồng (nếu có), không thì 0.
export function computeGenerations(indexes) {
  const memo = new Map();
  const visiting = new Set();
  const gen = (id) => {
    if (memo.has(id)) return memo.get(id);
    if (visiting.has(id)) return 0;
    visiting.add(id);
    const parents = asArray(indexes.parentsByChildId.get(id)).filter((parentId) => indexes.peopleById.has(parentId));
    let value = 0;
    if (parents.length) {
      value = 1 + Math.max(...parents.map(gen));
    } else {
      const spouseGens = [...(indexes.spousesByPersonId.get(id) || [])]
        .filter((spouseId) => asArray(indexes.parentsByChildId.get(spouseId)).length > 0)
        .map(gen);
      if (spouseGens.length) value = Math.max(...spouseGens);
    }
    visiting.delete(id);
    memo.set(id, value);
    return value;
  };
  indexes.peopleById.forEach((_person, id) => gen(id));
  return memo;
}

export function computeDefaultCollapseState({
  people = [],
  families = [],
  childRows = [],
  selfId = null,
  ancestors = DEFAULT_ANCESTOR_GENERATIONS,
  descendants = DEFAULT_DESCENDANT_GENERATIONS,
  founderGenerations = DEFAULT_FOUNDER_GENERATIONS,
} = {}) {
  const indexes = buildFamilyIndexes(people, families, childRows);
  const generations = computeGenerations(indexes);
  const self = toId(selfId);
  const hasSelf = self && generations.has(self);
  const lo = hasSelf ? Math.max(0, generations.get(self) - ancestors) : 0;
  const hi = hasSelf ? generations.get(self) + descendants : founderGenerations - 1;
  const collapsed = new Set();
  const hiddenAncestors = new Set();
  generations.forEach((value, id) => {
    if (value < lo) hiddenAncestors.add(id);
    else if (value === hi && (indexes.childrenByParentId.get(id)?.size || 0) > 0) collapsed.add(id);
  });
  return { collapsed, hiddenAncestors };
}

// Những gì cần mở ra để `targetId` hiện lên: nhánh của tổ tiên (và của vợ/chồng nó) + chính nó nếu bị ẩn làm "đời trên".
export function computeExpandForTarget(targetId, people = [], families = [], childRows = []) {
  const indexes = buildFamilyIndexes(people, families, childRows);
  const target = toId(targetId);
  const collapse = new Set();
  const hiddenAncestors = new Set();
  if (!target || !indexes.peopleById.has(target)) return { collapse, hiddenAncestors };
  const roots = [target, ...(indexes.spousesByPersonId.get(target) || [])];
  roots.forEach((root) => {
    hiddenAncestors.add(root);
    getAncestorIds(root, indexes).forEach((id) => {
      collapse.add(id);
      hiddenAncestors.add(id);
    });
  });
  return { collapse, hiddenAncestors };
}

export function serializeCollapseState({ collapsed, hiddenAncestors } = {}) {
  return JSON.stringify({ collapsed: [...(collapsed || [])], hiddenAncestors: [...(hiddenAncestors || [])] });
}

// Trả null nếu không có/hỏng; id không còn trong cây bị bỏ.
export function parseCollapseState(raw, people = []) {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    if (!data || !Array.isArray(data.collapsed) || !Array.isArray(data.hiddenAncestors)) return null;
    const known = new Set(asArray(people).map((person) => Number(person.id)));
    const keep = (list) => new Set(list.map(Number).filter((id) => known.has(id)));
    return { collapsed: keep(data.collapsed), hiddenAncestors: keep(data.hiddenAncestors) };
  } catch {
    return null;
  }
}

export function loadCollapseState(key, people) {
  try {
    return parseCollapseState(window.localStorage.getItem(key), people);
  } catch {
    return null;
  }
}

export function saveCollapseState(key, state) {
  try {
    window.localStorage.setItem(key, serializeCollapseState(state));
  } catch {
    // localStorage bị chặn: bỏ qua, trạng thái chỉ sống trong phiên.
  }
}

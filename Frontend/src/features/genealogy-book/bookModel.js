// Mô hình "Sổ gia phả": gom người theo đời, ghép vợ/chồng, cha mẹ, con; định dạng ngày theo độ chính xác.
// Thuần logic (không React) để kiểm thử. Dữ liệu đã được máy chủ lọc quyền xem, ở đây chỉ trình bày lại.

const toNum = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

export function personName(person) {
  if (!person) return "";
  return (
    person.display_name ||
    [person.surname, person.middle_name, person.first_name].filter(Boolean).join(" ").trim() ||
    ""
  );
}

export function genderKey(gender) {
  if (gender === "male" || Number(gender) === 1) return "male";
  if (gender === "female" || Number(gender) === 2) return "female";
  return "unknown";
}

// Ngày theo độ chính xác: year -> chỉ năm; approximate -> ~năm; month -> MM/YYYY; unknown/không có -> "".
export function formatPartialDate(value, precision = "exact") {
  if (!value || precision === "unknown") return "";
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return "";
  const [, year, month, day] = match;
  if (precision === "year") return year;
  if (precision === "approximate") return `~${year}`;
  if (precision === "month") return `${month}/${year}`;
  return `${day}/${month}/${year}`;
}

// "MM-DD" (ngày giỗ âm lịch lưu ở máy chủ) -> "DD/MM".
export function formatAnniversary(value) {
  const match = String(value || "").match(/^(\d{1,2})-(\d{1,2})$/);
  if (!match) return "";
  return `${String(Number(match[2])).padStart(2, "0")}/${String(Number(match[1])).padStart(2, "0")}`;
}

// "living" | "deceased" | "unknown"
export function livingStatus(person) {
  const living = person?.is_living;
  if (living !== null && living !== undefined && living !== "") return Number(living) === 0 ? "deceased" : "living";
  return person?.death_date ? "deceased" : "unknown";
}

function buildRelations(people, families, children) {
  const byId = new Map();
  people.forEach((p) => byId.set(Number(p.id), p));
  const spouses = new Map();
  const parentsOf = new Map();
  const childrenOf = new Map();
  const add = (map, key, value) => {
    if (!map.has(key)) map.set(key, new Set());
    map.get(key).add(value);
  };
  const familyById = new Map();
  families.forEach((f) => {
    const father = toNum(f?.father_id);
    const mother = toNum(f?.mother_id);
    familyById.set(toNum(f?.id), { father, mother });
    if (father && mother) {
      add(spouses, father, mother);
      add(spouses, mother, father);
    }
  });
  children.forEach((row) => {
    const fam = familyById.get(toNum(row?.family_id));
    const child = toNum(row?.person_id);
    if (!fam || !child) return;
    [fam.father, fam.mother].forEach((parent) => {
      if (!parent) return;
      add(parentsOf, child, parent);
      add(childrenOf, parent, child);
    });
  });
  return { byId, spouses, parentsOf, childrenOf };
}

// Người thuộc nhánh: gốc + hậu duệ + vợ/chồng của họ.
export function branchIds(rootId, relations) {
  const root = toNum(rootId);
  const out = new Set();
  if (!root) return out;
  const stack = [root];
  while (stack.length) {
    const id = stack.pop();
    if (out.has(id)) continue;
    out.add(id);
    (relations.childrenOf.get(id) || []).forEach((c) => stack.push(c));
  }
  [...out].forEach((id) => (relations.spouses.get(id) || []).forEach((s) => out.add(s)));
  return out;
}

const byName = (a, b) => a.name.localeCompare(b.name, "vi");

export function buildBook({ people, families, children } = {}, { rootId = "", livingOnly = false } = {}) {
  const list = (Array.isArray(people) ? people : []).filter((p) => p && p.id != null);
  const relations = buildRelations(list, Array.isArray(families) ? families : [], Array.isArray(children) ? children : []);
  const nameOf = (id) => personName(relations.byId.get(id));
  const names = (set) => [...(set || [])].map(nameOf).filter(Boolean);
  const allowed = rootId ? branchIds(rootId, relations) : null;

  const entries = list
    .filter((p) => !allowed || allowed.has(Number(p.id)))
    .map((p) => {
      const id = Number(p.id);
      const status = livingStatus(p);
      return {
        id,
        name: personName(p) || `#${id}`,
        gender: genderKey(p.gender),
        generation: toNum(p.generation) || 1,
        status,
        birth: formatPartialDate(p.birth_date, p.birth_date_precision || "exact"),
        death: status === "living" ? "" : formatPartialDate(p.death_date, p.death_date_precision || "exact"),
        anniversary: formatAnniversary(p.death_anniversary_lunar),
        spouses: names(relations.spouses.get(id)),
        parents: names(relations.parentsOf.get(id)),
        children: names(relations.childrenOf.get(id)),
      };
    })
    .filter((e) => !livingOnly || e.status === "living");

  const groups = new Map();
  entries.forEach((e) => {
    if (!groups.has(e.generation)) groups.set(e.generation, []);
    groups.get(e.generation).push(e);
  });
  const generations = [...groups.keys()]
    .sort((a, b) => a - b)
    .map((generation) => ({ generation, people: groups.get(generation).sort(byName) }));

  const stats = {
    people: entries.length,
    generations: generations.length,
    living: entries.filter((e) => e.status === "living").length,
    deceased: entries.filter((e) => e.status === "deceased").length,
  };
  const index = [...entries].sort(byName).map((e) => ({ id: e.id, name: e.name, generation: e.generation }));
  return { stats, generations, index };
}

// Danh sách chọn gốc nhánh: người có con, sắp theo đời rồi tên.
export function branchRootOptions(people = [], families = [], children = []) {
  const list = (Array.isArray(people) ? people : []).filter((p) => p && p.id != null);
  const relations = buildRelations(list, Array.isArray(families) ? families : [], Array.isArray(children) ? children : []);
  return list
    .filter((p) => (relations.childrenOf.get(Number(p.id)) || new Set()).size > 0)
    .map((p) => ({ id: Number(p.id), name: personName(p) || `#${p.id}`, generation: toNum(p.generation) || 1 }))
    .sort((a, b) => a.generation - b.generation || a.name.localeCompare(b.name, "vi"));
}

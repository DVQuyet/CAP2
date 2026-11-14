// Dòng họ mẫu cho test lõi vẽ cây. Mọi dữ liệu sinh từ bộ số giả ngẫu nhiên có hạt giống cố định,
// nên mỗi lần chạy cho cùng một cây. Không có dữ liệu người thật.

const MALE = 1;
const FEMALE = 2;

function createRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

const pad = (value) => String(value).padStart(2, "0");

function createBuilder(seed) {
  const random = createRandom(seed);
  const people = [];
  const families = [];
  const childRows = [];
  let nextFamilyId = 1;

  const addPerson = (gender, generation, extra = {}) => {
    const id = people.length + 1;
    const year = 1800 + generation * 26 + Math.floor(random() * 12);
    const withBirth = random() < 0.7;
    const person = {
      id,
      display_name: `Người ${id}`,
      gender,
      generation,
      birth_date: withBirth ? `${pad(1 + Math.floor(random() * 28))}/${pad(1 + Math.floor(random() * 12))}/${year}` : null,
      birth_date_precision: random() < 0.85 ? "exact" : "unknown",
      tree_x: 0,
      tree_y: 0,
      display_order: 0,
      ...extra,
    };
    people.push(person);
    return person;
  };

  const addFamily = (father, mother, extra = {}) => {
    const family = {
      id: nextFamilyId,
      father_id: father ? father.id : null,
      mother_id: mother ? mother.id : null,
      relationship_status: "active",
      union_type: "marriage",
      ...extra,
    };
    nextFamilyId += 1;
    families.push(family);
    return family;
  };

  const addChild = (family, person, extra = {}) => {
    const order = childRows.filter((row) => row.family_id === family.id).length + 1;
    childRows.push({ family_id: family.id, person_id: person.id, sort_order: order, child_type: "biological", ...extra });
  };

  return { random, people, families, childRows, addPerson, addFamily, addChild };
}

// Một nhánh thẳng: mỗi đời một cặp vợ chồng, một con trai.
function straightLine() {
  const b = createBuilder(11);
  let father = b.addPerson(MALE, 1);
  for (let generation = 1; generation <= 6; generation += 1) {
    const mother = b.addPerson(FEMALE, generation);
    const family = b.addFamily(father, mother);
    const son = b.addPerson(MALE, generation + 1);
    b.addChild(family, son);
    father = son;
  }
  return b;
}

// Một người ba vợ (vợ cả, vợ lẽ, một cuộc hôn nhân đã ly hôn), mỗi vợ có con.
function manyWives() {
  const b = createBuilder(23);
  const founder = b.addPerson(MALE, 1);
  const first = b.addPerson(FEMALE, 1);
  const second = b.addPerson(FEMALE, 1);
  const third = b.addPerson(FEMALE, 1);
  const f1 = b.addFamily(founder, first, { wife_rank: 1, marriage_date: "1830-01-01" });
  const f2 = b.addFamily(founder, second, { wife_rank: 2, union_type: "concubine" });
  const f3 = b.addFamily(founder, third, { wife_rank: 3, relationship_status: "divorced" });
  [f1, f1, f1, f2, f2, f3].forEach((family, index) => {
    const child = b.addPerson(index % 2 ? FEMALE : MALE, 2);
    b.addChild(family, child);
    if (index < 3) {
      const spouse = b.addPerson(child.gender === MALE ? FEMALE : MALE, 2);
      const family2 = child.gender === MALE ? b.addFamily(child, spouse) : b.addFamily(spouse, child);
      for (let k = 0; k <= index; k += 1) b.addChild(family2, b.addPerson(k % 2 ? MALE : FEMALE, 3));
    }
  });
  return b;
}

// Con nuôi (có cả cha mẹ đẻ và cha mẹ nuôi), con riêng, con gái lấy chồng trong họ, gia đình khuyết cha hoặc mẹ.
function adoptiveAndStep() {
  const b = createBuilder(37);
  const a = b.addPerson(MALE, 1);
  const aw = b.addPerson(FEMALE, 1);
  const fa = b.addFamily(a, aw);
  const s1 = b.addPerson(MALE, 2);
  const s2 = b.addPerson(MALE, 2);
  const d1 = b.addPerson(FEMALE, 2);
  [s1, s2, d1].forEach((child) => b.addChild(fa, child));
  const w1 = b.addPerson(FEMALE, 2);
  const w2 = b.addPerson(FEMALE, 2);
  const f1 = b.addFamily(s1, w1);
  const f2 = b.addFamily(s2, w2);
  const c1 = b.addPerson(MALE, 3);
  const c2 = b.addPerson(FEMALE, 3);
  const c3 = b.addPerson(MALE, 3);
  b.addChild(f1, c1);
  b.addChild(f1, c2);
  b.addChild(f2, c3);
  // c1 làm con nuôi (thừa tự) nhà chú.
  b.addChild(f2, c1, { child_type: "heir" });
  // Con riêng của vợ theo về.
  const step = b.addPerson(MALE, 3);
  b.addChild(f2, step, { child_type: "step" });
  // Con gái lấy chồng là cháu trong họ: người chồng là dòng chính, con gái thành thẻ tham chiếu ở nhà cha mẹ.
  const fc = b.addFamily(c3, c2);
  b.addChild(fc, b.addPerson(MALE, 4));
  // Gia đình chỉ có mẹ, và gia đình chỉ có cha.
  const fm = b.addFamily(null, d1);
  b.addChild(fm, b.addPerson(FEMALE, 3));
  const lone = b.addPerson(MALE, 3);
  b.addChild(f1, lone);
  const fl = b.addFamily(lone, null);
  b.addChild(fl, b.addPerson(MALE, 4));
  return b;
}

// Không có gia đình nào: chỉ xếp theo đời.
function noFamilies() {
  const b = createBuilder(41);
  [1, 1, 2, 2, 2, 3, 5].forEach((generation, index) => b.addPerson(index % 2 ? FEMALE : MALE, generation, { display_order: 7 - index }));
  return b;
}

// Cây ngẫu nhiên: thủy tổ, mỗi cặp 0-4 con, con trai lấy vợ ngoài họ, thỉnh thoảng có vợ hai và con nuôi.
function randomClan(seed, target) {
  const b = createBuilder(seed);
  const founder = b.addPerson(MALE, 1);
  const queue = [founder];
  const familiesWithChildren = [];
  while (queue.length && b.people.length < target) {
    const man = queue.shift();
    const wife = b.addPerson(FEMALE, man.generation);
    const family = b.addFamily(man, wife, { wife_rank: 1 });
    const unions = [family];
    if (b.random() < 0.06) {
      const secondWife = b.addPerson(FEMALE, man.generation);
      unions.push(b.addFamily(man, secondWife, { wife_rank: 2, union_type: b.random() < 0.5 ? "concubine" : "marriage" }));
    }
    unions.forEach((union) => {
      // Hàng đợi sắp cạn thì nhánh này chắc chắn có con trai nối dõi, để cây đạt đủ số người.
      const scarce = queue.length < 4;
      const count = scarce ? 2 + Math.floor(b.random() * 3) : Math.floor(b.random() * 5);
      for (let index = 0; index < count && b.people.length < target; index += 1) {
        const forceSon = scarce && index === 0;
        const child = b.addPerson(forceSon || b.random() < 0.55 ? MALE : FEMALE, man.generation + 1);
        b.addChild(union, child);
        if (child.gender === MALE && (forceSon || b.random() < 0.8)) queue.push(child);
        else if (child.gender === FEMALE && b.random() < 0.15) {
          const husband = b.addPerson(MALE, child.generation);
          const daughterFamily = b.addFamily(husband, child);
          if (b.random() < 0.5) b.addChild(daughterFamily, b.addPerson(MALE, child.generation + 1));
        }
      }
      if (count > 0) familiesWithChildren.push(union);
    });
  }
  // Vài người làm con nuôi ở một gia đình khác cùng đời cha mẹ.
  familiesWithChildren.forEach((family, index) => {
    if (index % 17 !== 5) return;
    const father = b.people[family.father_id - 1];
    const other = familiesWithChildren.find((item) => item.id !== family.id && b.people[item.father_id - 1]?.generation === father.generation);
    const child = b.childRows.find((row) => row.family_id === family.id);
    if (other && child) b.addChild(other, b.people[child.person_id - 1], { child_type: "adopted" });
  });
  return b;
}

// Một ít vị trí kéo tay: cứ 9 người thì một người được đặt sẵn tọa độ.
function withManualPositions(people) {
  return people.map((person, index) => (index % 9 === 4
    ? { ...person, tree_x: 400 + index * 60, tree_y: 140 + (person.generation - 1) * 220 + 40 }
    : person));
}

// Đường nối đã chỉnh tay cho vài gia đình, gồm cả khóa tên cũ và trục dọc.
function sampleLineRoutes(families) {
  const routes = {};
  families.forEach((family, index) => {
    if (index % 5 === 0) routes[family.id] = { baseY: 300 + index * 7, trunkX: 500 + index * 13 };
    if (index % 5 === 1) routes[family.id] = { axis: "vertical", baseX: 420 + index * 11, parentBranchY: 260 + index * 5 };
    if (index % 5 === 2) routes[family.id] = { childJoinY: 310 + index * 3, parentBranchX: 380 + index * 9 };
    if (index % 5 === 3) routes[family.id] = { parentAnchorX: 200 + index * 17, parentAnchorY: 180 + index * 3, axis: "horizontal" };
  });
  return routes;
}

const SAMPLE_BUILDERS = {
  straightLine,
  manyWives,
  adoptiveAndStep,
  noFamilies,
  random120: () => randomClan(101, 120),
  random500: () => randomClan(202, 500),
  random2000: () => randomClan(303, 2000),
};

export const SAMPLE_NAMES = Object.keys(SAMPLE_BUILDERS);

export function buildSample(name) {
  const builder = SAMPLE_BUILDERS[name]();
  return {
    name,
    people: builder.people,
    families: builder.families,
    childRows: builder.childRows,
    manualPeople: withManualPositions(builder.people),
    lineRoutes: sampleLineRoutes(builder.families),
  };
}

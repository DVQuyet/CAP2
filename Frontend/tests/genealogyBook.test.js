import test from "node:test";
import assert from "node:assert/strict";
import {
  branchRootOptions,
  buildBook,
  formatAnniversary,
  formatPartialDate,
  livingStatus,
} from "../src/features/genealogy-book/bookModel.js";

const people = [
  { id: 1, display_name: "Nguyễn Văn A", gender: 1, generation: 1, birth_date: "1920-03-04", birth_date_precision: "year", is_living: 0, death_date: "1990-05-06", death_date_precision: "exact", death_anniversary_lunar: "04-12" },
  { id: 2, display_name: "Trần Thị B", gender: 2, generation: 1, is_living: 0 },
  { id: 3, display_name: "Nguyễn Văn C", gender: 1, generation: 2, birth_date: "1950-01-02", is_living: 1 },
  { id: 4, display_name: "Lê Thị D", gender: 2, generation: 2, is_living: 1 },
  { id: 5, display_name: "Nguyễn Văn E", gender: 1, generation: 3 },
];
const families = [{ id: 10, father_id: 1, mother_id: 2 }, { id: 11, father_id: 3, mother_id: 4 }];
const children = [{ family_id: 10, person_id: 3 }, { family_id: 11, person_id: 5 }];

test("formatPartialDate respects precision", () => {
  assert.equal(formatPartialDate("1920-03-04", "year"), "1920");
  assert.equal(formatPartialDate("1920-03-04", "month"), "03/1920");
  assert.equal(formatPartialDate("1920-03-04", "exact"), "04/03/1920");
  assert.equal(formatPartialDate("1920-03-04", "approximate"), "~1920");
  assert.equal(formatPartialDate("1920-03-04", "unknown"), "");
  assert.equal(formatPartialDate(null), "");
});

test("formatAnniversary and livingStatus", () => {
  assert.equal(formatAnniversary("04-12"), "12/04");
  assert.equal(formatAnniversary("x"), "");
  assert.equal(livingStatus({ is_living: 1 }), "living");
  assert.equal(livingStatus({ death_date: "2000-01-01" }), "deceased");
  assert.equal(livingStatus({}), "unknown");
});

test("buildBook groups by generation with relations and stats", () => {
  const book = buildBook({ people, families, children });
  assert.deepEqual(book.generations.map((g) => g.generation), [1, 2, 3]);
  assert.deepEqual(book.stats, { people: 5, generations: 3, living: 2, deceased: 2 });
  const a = book.generations[0].people.find((p) => p.id === 1);
  assert.equal(a.birth, "1920");
  assert.equal(a.death, "06/05/1990");
  assert.equal(a.anniversary, "12/04");
  assert.deepEqual(a.spouses, ["Trần Thị B"]);
  assert.deepEqual(a.children, ["Nguyễn Văn C"]);
  assert.deepEqual(book.generations[2].people[0].parents.sort(), ["Lê Thị D", "Nguyễn Văn C"]);
  assert.equal(book.index.length, 5);
});

test("branch root and living-only filters", () => {
  const branch = buildBook({ people, families, children }, { rootId: 3 });
  assert.deepEqual(branch.index.map((i) => i.id).sort(), [3, 4, 5]);
  const living = buildBook({ people, families, children }, { livingOnly: true });
  assert.equal(living.stats.people, 2);
  assert.deepEqual(branchRootOptions(people, families, children).map((o) => o.id), [1, 2, 4, 3]);
});

test("handles empty and malformed input", () => {
  const book = buildBook({ people: null, families: undefined, children: [{}] });
  assert.deepEqual(book.stats, { people: 0, generations: 0, living: 0, deceased: 0 });
});

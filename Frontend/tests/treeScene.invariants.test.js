// Những điều luôn phải đúng với cây tự sắp xếp, bất kể dòng họ nào.
import test from "node:test";
import assert from "node:assert/strict";

import { SAMPLE_NAMES, buildSample } from "./fixtures/treeSamples.js";
import { treeSceneApi } from "./fixtures/treeSceneApi.js";

function sceneOf(name) {
  const sample = buildSample(name);
  const { people, references } = treeSceneApi.layout(sample.people, sample.families, sample.childRows);
  const tree = treeSceneApi.buildDisplayTree(people, sample.families, sample.childRows, { referencePlacements: references });
  const lines = treeSceneApi.buildDisplayTreeLines(tree, sample.families, sample.childRows, {});
  return { sample, people, tree, lines };
}

const overlaps = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

for (const name of SAMPLE_NAMES) {
  test(`"${name}": không có hai thẻ nào chồng lên nhau`, () => {
    const { tree } = sceneOf(name);
    const rows = new Map();
    tree.nodes.forEach((node) => rows.set(node.y, [...(rows.get(node.y) || []), node]));
    const clashes = [];
    rows.forEach((row) => {
      row.sort((a, b) => a.x - b.x);
      for (let index = 1; index < row.length; index += 1) {
        if (overlaps(row[index - 1], row[index])) clashes.push(`${row[index - 1].id} / ${row[index].id}`);
      }
    });
    assert.deepEqual(clashes, []);
  });

  test(`"${name}": mỗi người có đúng một thẻ chính, đặt ở hàng đời của mình`, () => {
    const { sample, people, tree } = sceneOf(name);
    const seen = new Map();
    tree.nodes.forEach((node) => node.personIds.forEach((id) => seen.set(id, (seen.get(id) || 0) + 1)));
    assert.equal(seen.size, sample.people.length);
    assert.ok([...seen.values()].every((count) => count === 1));
    const rowByGeneration = new Map();
    people.forEach((person) => {
      if (!rowByGeneration.has(person.generation)) rowByGeneration.set(person.generation, person.tree_y);
      assert.equal(person.tree_y, rowByGeneration.get(person.generation));
    });
    const generations = [...rowByGeneration.keys()].sort((a, b) => a - b);
    generations.forEach((generation, index) => {
      if (index > 0) assert.ok(rowByGeneration.get(generation) > rowByGeneration.get(generations[index - 1]));
    });
  });

  test(`"${name}": mọi đường con cái nối tới một thẻ con có thật và tọa độ là số`, () => {
    const { tree, lines } = sceneOf(name);
    const nodeIds = new Set(tree.nodes.map((node) => node.id));
    lines.filter((line) => line.d).forEach((line) => assert.ok(!/NaN|Infinity|undefined/.test(line.d), line.id));
    lines
      .filter((line) => line.type === "blood" && /-child-/.test(line.id))
      .forEach((line) => assert.ok(nodeIds.has(line.id.split("-child-")[1]), line.id));
  });
}

// Quy tắc thứ tự anh chị em: ngày sinh (khi đủ chính xác và khác nhau) trước, rồi tới "con thứ".
test("anh chị em đứng từ trái sang phải theo con thứ, ngày sinh rõ thì theo ngày sinh", () => {
  const person = (id, generation, extra = {}) => ({ id, gender: 1, generation, tree_x: 0, tree_y: 0, display_order: 0, ...extra });
  const families = [{ id: 1, father_id: 1, mother_id: 2 }];
  const xsOf = (children, childRows) => {
    const people = [person(1, 1), person(2, 1, { gender: 2 }), ...children];
    const byId = new Map(treeSceneApi.layout(people, families, childRows).people.map((item) => [item.id, item.tree_x]));
    return children.map((child) => byId.get(child.id));
  };

  // Không có ngày sinh: id 5 là con trưởng, id 3 là con út.
  const byOrder = xsOf([person(3, 2), person(4, 2), person(5, 2)], [
    { family_id: 1, person_id: 3, sort_order: 3 },
    { family_id: 1, person_id: 4, sort_order: 2 },
    { family_id: 1, person_id: 5, sort_order: 1 },
  ]);
  assert.ok(byOrder[2] < byOrder[1] && byOrder[1] < byOrder[0]);

  // Có ngày sinh rõ: người sinh trước đứng bên trái dù "con thứ" ghi ngược.
  const byBirth = xsOf([person(3, 2, { birth_date: "01/01/1990" }), person(4, 2, { birth_date: "01/01/1980" })], [
    { family_id: 1, person_id: 3, sort_order: 1 },
    { family_id: 1, person_id: 4, sort_order: 2 },
  ]);
  assert.ok(byBirth[1] < byBirth[0]);
});

test("vị trí kéo tay được giữ nguyên khi trộn với kết quả tự sắp xếp", () => {
  const sample = buildSample("random120");
  const merged = treeSceneApi.mergeManualAndAutoLayout(sample.manualPeople, sample.families, sample.childRows);
  const mergedById = new Map(merged.map((person) => [person.id, person]));
  sample.manualPeople.filter((person) => person.tree_x || person.tree_y).forEach((person) => {
    assert.equal(mergedById.get(person.id).tree_x, person.tree_x);
    assert.equal(mergedById.get(person.id).tree_y, person.tree_y);
  });
  assert.ok(merged.every((person) => person.tree_x !== 0 || person.tree_y !== 0));
});

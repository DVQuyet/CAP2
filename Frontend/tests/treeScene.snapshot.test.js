// Khóa kết quả của lõi vẽ cây: vị trí từng người, thẻ, điểm nối và chuỗi đường nối của các dòng họ mẫu
// phải trùng mã băm đã ghi trong fixtures/treeSceneSnapshot.json.
// Cố ý đổi cách vẽ: chạy `node tests/fixtures/treeSceneUpdate.js`, xem phần lệch, rồi ghi lý do vào commit.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { SAMPLE_NAMES, buildSample } from "./fixtures/treeSamples.js";
import { captureSample, digestSample } from "./fixtures/treeSceneCapture.js";
import { treeSceneApi } from "./fixtures/treeSceneApi.js";

const snapshot = JSON.parse(readFileSync(new URL("./fixtures/treeSceneSnapshot.json", import.meta.url), "utf8"));

for (const name of SAMPLE_NAMES) {
  test(`cây mẫu "${name}" vẽ ra đúng như ảnh chuẩn`, () => {
    const digests = digestSample(captureSample(treeSceneApi, buildSample(name)));
    const expected = Object.fromEntries(Object.keys(digests).map((key) => [key, snapshot[name][key]]));
    assert.deepEqual(digests, expected);
  });
}

test("bỏ tay nắm chỉnh đường thì các đường vẽ giữ nguyên", () => {
  const sample = buildSample("random120");
  const { people, references } = treeSceneApi.layout(sample.people, sample.families, sample.childRows);
  const tree = treeSceneApi.buildDisplayTree(people, sample.families, sample.childRows, { referencePlacements: references });
  const all = treeSceneApi.buildDisplayTreeLines(tree, sample.families, sample.childRows, sample.lineRoutes);
  const drawn = treeSceneApi.buildDisplayTreeLines(tree, sample.families, sample.childRows, sample.lineRoutes, { controls: false });
  assert.deepEqual(drawn, all.filter((line) => line.type !== "route-control"));
  assert.ok(drawn.length < all.length);
});

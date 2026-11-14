// Ghi lại ảnh chuẩn của lõi vẽ cây sau khi CỐ Ý đổi cách vẽ:  node tests/fixtures/treeSceneUpdate.js
// In ra phần nào của mẫu nào đổi mã băm để người sửa kiểm lại trước khi commit.
import { readFileSync, writeFileSync } from "node:fs";

import { SAMPLE_NAMES, buildSample } from "./treeSamples.js";
import { captureSample, digestSample } from "./treeSceneCapture.js";
import { treeSceneApi } from "./treeSceneApi.js";

const file = new URL("./treeSceneSnapshot.json", import.meta.url);
const previous = JSON.parse(readFileSync(file, "utf8"));
const next = {};
const changed = [];
for (const name of SAMPLE_NAMES) {
  next[name] = digestSample(captureSample(treeSceneApi, buildSample(name)));
  Object.keys(next[name]).forEach((key) => {
    if (previous[name]?.[key] !== next[name][key]) changed.push(`${name}.${key}`);
  });
}
writeFileSync(file, `${JSON.stringify(next, null, 2)}\n`);
process.stdout.write(changed.length ? `Đổi: ${changed.join(", ")}\n` : "Không đổi gì.\n");

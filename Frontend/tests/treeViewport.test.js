import test from "node:test";
import assert from "node:assert/strict";

import {
  expandRect,
  filterLinesInWindow,
  filterNodesInWindow,
  lineBounds,
  nextRenderWindow,
  pathBounds,
  viewRectFromTransform,
  zoomLevelFor,
} from "../src/features/genealogy/utils/tree-editor/treeViewport.js";

test("vùng nhìn tính ngược từ vị trí và mức zoom", () => {
  assert.deepEqual(viewRectFromTransform({ positionX: -200, positionY: -100, scale: 2 }, 800, 600), {
    left: 100, top: 50, right: 500, bottom: 350,
  });
});

test("cửa sổ vẽ nới mỗi phía một màn hình và giữ nguyên khi kéo nền trong vùng an toàn", () => {
  const view = { left: 0, top: 0, right: 100, bottom: 100 };
  const first = nextRenderWindow(null, view);
  assert.deepEqual(first, expandRect(view));
  assert.deepEqual(first, { left: -100, top: -100, right: 200, bottom: 200 });
  // Kéo nền 80px: vẫn nằm trong cửa sổ, trả lại đúng đối tượng cũ (không setState).
  assert.equal(nextRenderWindow(first, { left: 80, top: 80, right: 180, bottom: 180 }), first);
  // Kéo quá mép: tính cửa sổ mới quanh vùng nhìn mới.
  const moved = nextRenderWindow(first, { left: 150, top: 0, right: 250, bottom: 100 });
  assert.notEqual(moved, first);
  assert.deepEqual(moved, { left: 50, top: -100, right: 350, bottom: 200 });
});

test("thu nhỏ ra ngoài cửa sổ hoặc phóng to quá nhiều thì tính lại cửa sổ", () => {
  const current = nextRenderWindow(null, { left: 0, top: 0, right: 100, bottom: 100 });
  assert.notEqual(nextRenderWindow(current, { left: -200, top: -200, right: 300, bottom: 300 }), current);
  assert.notEqual(nextRenderWindow(current, { left: 40, top: 40, right: 50, bottom: 50 }), current);
  assert.equal(nextRenderWindow(current, { left: 0, top: 0, right: 0, bottom: 0 }), current);
});

test("khung bao đường nối từ chuỗi d và từ nút điều khiển", () => {
  assert.deepEqual(pathBounds("M 10 20 L 10 80 Q 10 96 26 96 L 300 96"), { left: 10, top: 20, right: 300, bottom: 96 });
  assert.deepEqual(pathBounds("M -5 -10 L 5 10"), { left: -5, top: -10, right: 5, bottom: 10 });
  assert.equal(pathBounds(""), null);
  assert.deepEqual(lineBounds({ type: "route-control", x: 100, y: 50 }), { left: 72, top: 22, right: 128, bottom: 78 });
});

test("lọc thẻ và đường nối theo cửa sổ, giữ thẻ đang kéo/chọn", () => {
  const nodes = [
    { id: "a", x: 0, y: 0, width: 100, height: 50 },
    { id: "b", x: 5000, y: 0, width: 100, height: 50 },
    { id: "c", x: 9000, y: 0, width: 100, height: 50 },
  ];
  const renderWindow = { left: -100, top: -100, right: 400, bottom: 400 };
  assert.deepEqual(filterNodesInWindow(nodes, renderWindow, new Set(["c"])).map((node) => node.id), ["a", "c"]);
  assert.equal(filterNodesInWindow(nodes, null, new Set()), nodes);

  const near = { id: "l1", d: "M 0 0 L 100 100" };
  const far = { id: "l2", d: "M 5000 0 L 5100 0" };
  const unknown = { id: "l3" };
  const bounds = new Map([near, far, unknown].map((line) => [line, lineBounds(line)]));
  assert.deepEqual(filterLinesInWindow([near, far, unknown], bounds, renderWindow).map((line) => line.id), ["l1", "l3"]);
});

test("mức chi tiết theo zoom: dưới 35% chỉ tên, 35–70% tên và năm, từ 70% đầy đủ", () => {
  assert.equal(zoomLevelFor(0.2), "far");
  assert.equal(zoomLevelFor(0.35), "mid");
  assert.equal(zoomLevelFor(0.69), "mid");
  assert.equal(zoomLevelFor(0.7), "near");
  assert.equal(zoomLevelFor(2.6), "near");
});

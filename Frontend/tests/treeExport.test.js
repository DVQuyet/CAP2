import test from "node:test";
import assert from "node:assert/strict";
import {
  MAX_CANVAS_PIXELS,
  MAX_CANVAS_SIDE,
  computeContentBounds,
  decideRasterScale,
  exportFileName,
  exportSlug,
  normalizeExportScale,
} from "../src/features/genealogy/utils/tree-editor/treeExportMath.js";

test("normalizeExportScale accepts 1-4 and defaults to 3", () => {
  assert.equal(normalizeExportScale(2), 2);
  assert.equal(normalizeExportScale("4"), 4);
  assert.equal(normalizeExportScale(7), 3);
  assert.equal(normalizeExportScale(undefined), 3);
});

test("small trees keep the requested scale", () => {
  const info = decideRasterScale({ width: 2000, height: 1500, scale: 3 });
  assert.equal(info.scale, 3);
  assert.equal(info.limited, false);
  assert.equal(info.pixelWidth, 6000);
  assert.equal(info.pixelHeight, 4500);
});

test("huge trees are downscaled under side and area limits", () => {
  const wide = decideRasterScale({ width: 20000, height: 1000, scale: 4 });
  assert.equal(wide.limited, true);
  assert.ok(wide.pixelWidth <= MAX_CANVAS_SIDE);
  const big = decideRasterScale({ width: 12000, height: 12000, scale: 4 });
  assert.equal(big.limited, true);
  assert.ok(big.pixelWidth * big.pixelHeight <= MAX_CANVAS_PIXELS);
  const enormous = decideRasterScale({ width: 60000, height: 40000, scale: 3 });
  assert.ok(enormous.scale < 1);
  assert.ok(enormous.pixelWidth <= MAX_CANVAS_SIDE && enormous.pixelHeight <= MAX_CANVAS_SIDE);
});

test("content bounds cover cards and line points with padding", () => {
  const bounds = computeContentBounds(
    [{ x: 100, y: 50, width: 200, height: 80 }],
    ["M 0 10 L 500 10 L 500 400"],
    20,
  );
  assert.deepEqual(bounds, { x: -20, y: -10, width: 540, height: 430 });
});

test("empty content falls back to a default frame", () => {
  assert.deepEqual(computeContentBounds([], []), { x: 0, y: 0, width: 1200, height: 800 });
});

test("file name is ascii slug with timestamp and extension", () => {
  assert.equal(exportSlug("Nguyễn Đình / Họ"), "nguyen-dinh-ho");
  const name = exportFileName("Lê Văn", ".svg", new Date(2026, 0, 5, 9, 7));
  assert.equal(name, "gia-pha-le-van-20260105-0907.svg");
});

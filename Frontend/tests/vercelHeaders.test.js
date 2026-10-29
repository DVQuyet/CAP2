import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const readJson = (relative) => JSON.parse(readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8"));

// Vercel có thể đọc vercel.json ở gốc repo hoặc ở Frontend/: hai file phải giữ cùng chính sách.
for (const [label, relative] of [["Frontend/vercel.json", "../vercel.json"], ["vercel.json (gốc repo)", "../../vercel.json"]]) {
  test(`${label}: hợp lệ và có CSP ở chế độ Report-Only (chưa chặn)`, () => {
    const config = readJson(relative);
    const entry = config.headers.find((item) => item.source === "/(.*)");
    assert.ok(entry, "thiếu khối header cho mọi đường dẫn");
    const keys = entry.headers.map((header) => header.key);
    assert.ok(keys.includes("Content-Security-Policy-Report-Only"));
    assert.ok(!keys.includes("Content-Security-Policy"), "mới ở chế độ báo cáo; chuyển sang chặn chỉ sau khi hết báo vi phạm");

    const csp = entry.headers.find((header) => header.key === "Content-Security-Policy-Report-Only").value;
    for (const part of ["default-src 'self'", "script-src 'self'", "https://fonts.googleapis.com", "https://fonts.gstatic.com", "https://cap2-backend.onrender.com", "wss://cap2-backend.onrender.com", "frame-ancestors 'none'"]) {
      assert.ok(csp.includes(part), `CSP thiếu: ${part}`);
    }
    assert.ok(!/unsafe-eval/.test(csp));
  });

  test(`${label}: vẫn giữ rewrite SPA và không cache service worker`, () => {
    const config = readJson(relative);
    assert.deepEqual(config.rewrites, [{ source: "/(.*)", destination: "/index.html" }]);
    const sw = config.headers.find((item) => item.source === "/sw.js");
    assert.ok(sw.headers.some((header) => /no-store/.test(header.value)));
  });
}

test("hai vercel.json có cùng chính sách CSP", () => {
  const pick = (relative) => readJson(relative).headers.find((item) => item.source === "/(.*)").headers[0].value;
  assert.equal(pick("../vercel.json"), pick("../../vercel.json"));
});

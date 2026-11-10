// Đo hiệu năng cây gia phả trên trang xem thử bằng Chrome headless (không cần cài thêm gì, Node >= 22).
//   1) cd Frontend && npx vite --port 5199 --strictPort
//   2) node dev/tree-perf.mjs [số người=500] [đường dẫn chrome]
// In ra: số phần tử DOM, và với từng thao tác (kéo thẻ, zoom, chọn người): số lần React commit,
// thời gian commit trung bình/lớn nhất, khung hình/giây và thời gian khung hình p95.
// Lưu ý: Vite dev + React bản dev + Chrome headless không GPU nên số tuyệt đối chậm hơn bản build
// trên máy thật; dùng để so trước/sau trên cùng một máy.
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const count = Number(process.argv[2]) || 500;
const chromePath = process.argv[3] || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const base = process.env.TREE_PREVIEW_URL || "http://localhost:5199/dev/tree-preview.html";
const port = 9300 + Math.floor(Math.random() * 500);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const chrome = spawn(chromePath, [
  "--headless=new", "--disable-gpu", "--no-first-run", "--hide-scrollbars",
  `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), "tree-perf-"))}`,
  "--window-size=1280,800", "about:blank",
], { stdio: "ignore" });

async function connect() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      const page = targets.find((target) => target.type === "page");
      if (page) return page.webSocketDebuggerUrl;
    } catch { /* Chrome chưa sẵn sàng */ }
    await sleep(200);
  }
  throw new Error("Không nối được Chrome");
}

const socket = new WebSocket(await connect());
await new Promise((resolve) => socket.addEventListener("open", resolve, { once: true }));
let messageId = 0;
const pending = new Map();
socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    pending.get(message.id)(message);
    pending.delete(message.id);
  }
});
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++messageId;
  pending.set(id, (message) => (message.error ? reject(new Error(`${method}: ${message.error.message}`)) : resolve(message.result)));
  socket.send(JSON.stringify({ id, method, params }));
});
const evaluate = async (expression) => {
  const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || "Lỗi evaluate");
  return result.result.value;
};
const mouse = (type, x, y, extra = {}) => send("Input.dispatchMouseEvent", { type, x, y, button: "left", buttons: type === "mouseReleased" ? 0 : 1, clickCount: 1, ...extra });

await send("Page.enable");
await send("Page.navigate", { url: `${base}?n=${count}&profile=1&theme=traditional` });
// Chờ cây vẽ xong: số thẻ ổn định qua hai lần đọc.
let cards = 0;
for (let attempt = 0; attempt < 120; attempt += 1) {
  await sleep(500);
  const next = await evaluate(`document.querySelectorAll('.fte-personCard, .fte-coupleCard').length`).catch(() => 0);
  if (next > 0 && next === cards) break;
  cards = next;
}
await sleep(1500);

await evaluate(`(() => {
  window.__frames = [];
  const loop = (time) => { window.__frames.push(time); requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
})()`);

const dom = await evaluate(`({
  cards: document.querySelectorAll('.fte-personCard, .fte-coupleCard').length,
  canvasNodes: document.querySelector('#family-tree')?.querySelectorAll('*').length || 0,
  lines: document.querySelectorAll('.fte-line').length,
  people: ${count},
})`);

async function measure(label, action) {
  await evaluate(`window.__commits.length = 0; window.__frames.length = 0; true`);
  const started = Date.now();
  await action();
  await sleep(300);
  const elapsed = Date.now() - started;
  const stats = await evaluate(`(() => {
    const commits = window.__commits.slice();
    const frames = window.__frames.slice();
    const gaps = frames.slice(1).map((time, index) => time - frames[index]).sort((a, b) => a - b);
    const sum = (list) => list.reduce((total, value) => total + value, 0);
    return {
      commits: commits.length,
      commitAvgMs: commits.length ? sum(commits) / commits.length : 0,
      commitMaxMs: commits.length ? Math.max(...commits) : 0,
      commitTotalMs: sum(commits),
      frames: frames.length,
      frameP95Ms: gaps.length ? gaps[Math.floor(gaps.length * 0.95)] : 0,
      frameMaxMs: gaps.length ? gaps[gaps.length - 1] : 0,
    };
  })()`);
  const round = (value) => Math.round(value * 10) / 10;
  return {
    "thao tác": label,
    "commit": stats.commits,
    "commit TB (ms)": round(stats.commitAvgMs),
    "commit max (ms)": round(stats.commitMaxMs),
    "tổng commit (ms)": round(stats.commitTotalMs),
    "fps": round((stats.frames / elapsed) * 1000),
    "khung p95 (ms)": round(stats.frameP95Ms),
    "khung max (ms)": round(stats.frameMaxMs),
  };
}

// Tìm một thẻ một người đang nằm trong vùng nhìn thấy (không bị thanh công cụ che).
const target = await evaluate(`(() => {
  const view = document.querySelector('.fte-viewport, .fte-transformWrapper, #family-tree')?.getBoundingClientRect();
  const all = [...document.querySelectorAll('.fte-personCard')];
  const pick = all.map((el) => el.getBoundingClientRect()).find((rect) => rect.left > 200 && rect.right < 1000 && rect.top > 200 && rect.bottom < 650 && rect.width > 8);
  const rect = pick || all[0]?.getBoundingClientRect();
  return rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : null;
})()`);
if (!target) throw new Error("Không tìm thấy thẻ nào để kéo");

// Ghi lại vị trí thẻ sẽ kéo để kiểm tra sau khi thả thẻ thật sự dời đi và ở đúng chỗ.
const readDragged = () => evaluate(`(() => {
  const el = window.__dragged || (window.__dragged = document.elementFromPoint(${target.x}, ${target.y})?.closest('.fte-personCard'));
  return el ? { id: el.id, transform: el.style.transform } : null;
})()`);
const draggedBefore = await readDragged();
const results = [];
results.push(await measure("kéo thẻ (60 bước)", async () => {
  await mouse("mouseMoved", target.x, target.y, { buttons: 0 });
  await mouse("mousePressed", target.x, target.y);
  for (let step = 1; step <= 60; step += 1) {
    await mouse("mouseMoved", target.x + step * 3, target.y + step * 2);
    await sleep(16);
  }
  await mouse("mouseReleased", target.x + 180, target.y + 120);
}));
results.push(await measure("zoom (20 nấc lăn chuột)", async () => {
  for (let step = 0; step < 20; step += 1) {
    await send("Input.dispatchMouseEvent", { type: "mouseWheel", x: 640, y: 420, deltaX: 0, deltaY: step < 10 ? -120 : 120 });
    await sleep(40);
  }
}));
results.push(await measure("kéo nền (pan 40 bước)", async () => {
  await mouse("mousePressed", 1100, 700);
  for (let step = 1; step <= 40; step += 1) {
    await mouse("mouseMoved", 1100 - step * 6, 700 - step * 4);
    await sleep(16);
  }
  await mouse("mouseReleased", 860, 540);
}));
results.push(await measure("chọn một người (bấm)", async () => {
  const spot = await evaluate(`(() => {
    const rect = [...document.querySelectorAll('.fte-personCard')].map((el) => el.getBoundingClientRect()).find((r) => r.left > 150 && r.right < 1050 && r.top > 180 && r.bottom < 680 && r.width > 8);
    return rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : null;
  })()`);
  if (!spot) return;
  await mouse("mousePressed", spot.x, spot.y);
  await mouse("mouseReleased", spot.x, spot.y);
  await sleep(400);
}));

const draggedAfter = await evaluate(`(() => { const el = document.getElementById(${JSON.stringify(draggedBefore?.id || "")}); return el ? { id: el.id, transform: el.style.transform } : null; })()`);
console.log("thẻ kéo:", JSON.stringify(draggedBefore), "->", JSON.stringify(draggedAfter));
console.log(JSON.stringify(dom));
console.table(results);
socket.close();
chrome.kill();
process.exit(0);

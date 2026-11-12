// So ảnh chụp cây (tree-shots.sh) với bộ ảnh mẫu để bắt lỗi giao diện khi sửa CSS.
//   1) bash dev/tree-shots.sh <thư mục mới>
//   2) node dev/tree-shots-compare.mjs <thư mục mẫu> <thư mục mới> [thư mục ra diff] [ngưỡng %]
// Ghép cặp ảnh theo tên (bỏ đuôi, nhận .png và .webp). Giải mã bằng Chrome headless nên đọc được WebP,
// không cần thêm thư viện. Điểm ảnh coi là khác khi chênh mỗi kênh > 24 (bỏ nhiễu nén WebP).
// Mã thoát 1 nếu có cặp LỆCH (khác kích thước hoặc vượt ngưỡng) hoặc thiếu ảnh. Mặc định ngưỡng 1%.
// Ví dụ: node dev/tree-shots-compare.mjs ../docs/anh/cay-A1/sau $TEMP/shots-moi $TEMP/shots-diff 1
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { extname, join, basename } from "node:path";

const [baseDir, newDir, diffArg, thresholdArg] = process.argv.slice(2);
if (!baseDir || !newDir) {
  process.stdout.write("Cách dùng: node dev/tree-shots-compare.mjs <thư mục mẫu> <thư mục mới> [thư mục ra diff] [ngưỡng %]\n");
  process.exit(2);
}
const diffDir = diffArg || join(tmpdir(), "tree-shots-diff");
const threshold = Number(thresholdArg ?? 1);
const chromePath = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const port = 9800 + Math.floor(Math.random() * 500);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const MIME = { ".png": "image/png", ".webp": "image/webp" };

// Liệt kê ảnh theo tên không đuôi.
function listImages(dir) {
  const map = new Map();
  for (const file of readdirSync(dir)) {
    if (MIME[extname(file).toLowerCase()]) map.set(basename(file, extname(file)), join(dir, file));
  }
  return map;
}
const dataUrl = (file) => `data:${MIME[extname(file).toLowerCase()]};base64,${readFileSync(file).toString("base64")}`;

// Hàm chạy trong trang Chrome: giải mã hai ảnh, đếm điểm khác, vẽ ảnh diff.
const PAGE_COMPARE = `(async (urlA, urlB, tolerance) => {
  const load = (url) => new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Không giải mã được ảnh"));
    img.src = url;
  });
  const pixels = (img) => {
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    return ctx.getImageData(0, 0, canvas.width, canvas.height);
  };
  const [imgA, imgB] = await Promise.all([load(urlA), load(urlB)]);
  const size = { a: [imgA.naturalWidth, imgA.naturalHeight], b: [imgB.naturalWidth, imgB.naturalHeight] };
  if (size.a[0] !== size.b[0] || size.a[1] !== size.b[1]) return { sizeMismatch: true, size };
  const dataA = pixels(imgA).data;
  const imageB = pixels(imgB);
  const dataB = imageB.data;
  const out = new ImageData(size.b[0], size.b[1]);
  let changed = 0;
  for (let i = 0; i < dataA.length; i += 4) {
    const diff = Math.abs(dataA[i] - dataB[i]) > tolerance || Math.abs(dataA[i + 1] - dataB[i + 1]) > tolerance
      || Math.abs(dataA[i + 2] - dataB[i + 2]) > tolerance;
    if (diff) {
      changed += 1;
      out.data[i] = 255; out.data[i + 1] = 0; out.data[i + 2] = 0;
    } else {
      // Nền: ảnh mới làm mờ về phía trắng.
      out.data[i] = 255 - (255 - dataB[i]) * 0.3;
      out.data[i + 1] = 255 - (255 - dataB[i + 1]) * 0.3;
      out.data[i + 2] = 255 - (255 - dataB[i + 2]) * 0.3;
    }
    out.data[i + 3] = 255;
  }
  const canvas = document.createElement("canvas");
  canvas.width = size.b[0]; canvas.height = size.b[1];
  canvas.getContext("2d").putImageData(out, 0, 0);
  return { size, changed, total: dataA.length / 4, png: canvas.toDataURL("image/png") };
})`;

async function openChrome(profile) {
  const chrome = spawn(chromePath, [
    "--headless=new", "--disable-gpu", "--no-first-run", `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`, "about:blank",
  ], { stdio: "ignore" });
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      const page = targets.find((target) => target.type === "page");
      if (page) return { chrome, wsUrl: page.webSocketDebuggerUrl };
    } catch { /* Chrome chưa sẵn sàng */ }
    await sleep(200);
  }
  chrome.kill();
  throw new Error("Không nối được Chrome");
}

function makeClient(socket) {
  let messageId = 0;
  const pending = new Map();
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      pending.get(message.id)(message);
      pending.delete(message.id);
    }
  });
  return (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++messageId;
    pending.set(id, (message) => (message.error ? reject(new Error(`${method}: ${message.error.message}`)) : resolve(message.result)));
    socket.send(JSON.stringify({ id, method, params }));
  });
}

const baseImages = listImages(baseDir);
const newImages = listImages(newDir);
const names = [...new Set([...baseImages.keys(), ...newImages.keys()])].sort();
if (names.length === 0) {
  process.stdout.write("Không có ảnh nào để so.\n");
  process.exit(1);
}
mkdirSync(diffDir, { recursive: true });

const profile = mkdtempSync(join(tmpdir(), "tree-compare-"));
const { chrome, wsUrl } = await openChrome(profile);
const socket = new WebSocket(wsUrl);
await new Promise((resolve) => socket.addEventListener("open", resolve, { once: true }));
const send = makeClient(socket);
const rows = [];
let failed = false;

for (const name of names) {
  const fileA = baseImages.get(name);
  const fileB = newImages.get(name);
  if (!fileA || !fileB) {
    rows.push({ "ảnh": name, "% khác": "-", "kết quả": fileA ? "THIẾU ẢNH MỚI" : "THIẾU ẢNH MẪU" });
    failed = true;
    continue;
  }
  const expression = `${PAGE_COMPARE}(${JSON.stringify(dataUrl(fileA))}, ${JSON.stringify(dataUrl(fileB))}, 24)`;
  const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) {
    rows.push({ "ảnh": name, "% khác": "-", "kết quả": "LỖI GIẢI MÃ" });
    failed = true;
    continue;
  }
  const value = result.result.value;
  if (value.sizeMismatch) {
    rows.push({ "ảnh": name, "% khác": "-", "kết quả": `LỆCH (cỡ ${value.size.a.join("x")} vs ${value.size.b.join("x")})` });
    failed = true;
    continue;
  }
  const percent = (value.changed / value.total) * 100;
  writeFileSync(join(diffDir, `${name}.png`), Buffer.from(value.png.split(",")[1], "base64"));
  const ok = percent <= threshold;
  if (!ok) failed = true;
  rows.push({ "ảnh": name, "% khác": percent.toFixed(3), "kết quả": ok ? "ĐẠT" : "LỆCH" });
}

socket.close();
chrome.kill();
try { rmSync(profile, { recursive: true, force: true }); } catch { /* Chrome còn giữ file, bỏ qua */ }
console.table(rows);
process.stdout.write(`Ngưỡng ${threshold}%. Ảnh diff: ${diffDir}\n${failed ? "CÓ ẢNH LỆCH" : "TẤT CẢ ĐẠT"}\n`);
process.exit(failed ? 1 : 0);

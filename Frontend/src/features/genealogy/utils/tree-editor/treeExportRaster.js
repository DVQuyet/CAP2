// Phần dùng trình duyệt của xuất ảnh: nhúng font vào SVG và rasterize SVG thành PNG nét.
import { BODY_FONT, TREE_THEME_PALETTES } from "./treeExportTheme";

const EMBED_FAMILIES = ["Manrope", "Noto Serif"];
const EMBED_SUBSETS = ["latin", "latin-ext", "vietnamese"];
const MAX_FONT_CSS_BYTES = 6 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 12000;

let fontCssPromise = null;

async function fetchWithTimeout(url, kind) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal, credentials: "omit" });
    if (!response.ok) throw new Error(`font fetch ${response.status}`);
    return kind === "text" ? await response.text() : await response.arrayBuffer();
  } finally {
    window.clearTimeout(timer);
  }
}

function toBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

async function buildFontCss() {
  const hrefs = Array.from(document.querySelectorAll('link[rel="stylesheet"][href*="fonts.googleapis.com/css"]'))
    .map((link) => link.href)
    .filter((href) => !/Material\+Symbols/i.test(href));
  const dataByUrl = new Map();
  let total = 0;
  let css = "";
  for (const href of hrefs) {
    let text;
    try {
      text = await fetchWithTimeout(href, "text");
    } catch {
      continue;
    }
    const blocks = text.matchAll(/(?:\/\*\s*([\w-]+)\s*\*\/\s*)?@font-face\s*\{([^}]*)\}/g);
    for (const [, subset, body] of blocks) {
      const family = /font-family:\s*['"]?([^;'"]+)['"]?/.exec(body)?.[1]?.trim();
      const url = /url\((https:[^)]+)\)/.exec(body)?.[1];
      if (!family || !url || !EMBED_FAMILIES.includes(family)) continue;
      if (subset && !EMBED_SUBSETS.includes(subset)) continue;
      if (/font-style:\s*italic/.test(body)) continue;
      try {
        if (!dataByUrl.has(url)) {
          const buffer = await fetchWithTimeout(url, "buffer");
          total += buffer.byteLength;
          if (total > MAX_FONT_CSS_BYTES) return css;
          dataByUrl.set(url, `data:font/woff2;base64,${toBase64(buffer)}`);
        }
        css += `@font-face{${body.replace(/src:[^;]*;/, `src:url(${dataByUrl.get(url)}) format("woff2");`).replace(/\s+/g, " ")}}\n`;
      } catch {
        // Bỏ qua font lỗi: dùng font hệ thống thay thế.
      }
    }
  }
  return css;
}

// Nhúng font (Vietnamese/Latin) dưới dạng data URL để SVG hiển thị đúng dấu khi mở riêng hoặc rasterize.
export function loadEmbeddedFontCss() {
  if (!fontCssPromise) fontCssPromise = buildFontCss().catch(() => "");
  return fontCssPromise;
}

// Đợi font của trang tải xong để đo chữ chính xác, kể cả khi font chưa từng được dùng.
export async function waitForExportFonts() {
  if (!document.fonts) return;
  const titleFonts = Object.values(TREE_THEME_PALETTES).map((p) => p.titleFont);
  const specs = [BODY_FONT, ...titleFonts].flatMap((family) => [`500 16px ${family}`, `800 16px ${family}`]);
  try {
    await Promise.all(specs.map((spec) => document.fonts.load(spec, "Ạ ắ Đ ữ ề")));
    await document.fonts.ready;
  } catch {
    // Không chặn xuất ảnh nếu font lỗi.
  }
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("svg image load failed"));
    image.src = url;
  });
}

export async function svgToPngBlob(svg, { pixelWidth, pixelHeight }) {
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const image = await loadImage(url);
    const canvas = document.createElement("canvas");
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas unavailable");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(image, 0, 0, pixelWidth, pixelHeight);
    return await new Promise((resolve, reject) => {
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("canvas toBlob failed"))), "image/png");
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

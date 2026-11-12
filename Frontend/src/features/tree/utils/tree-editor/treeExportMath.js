// Phần thuần của xuất ảnh cây: tính khung, quyết định tỉ lệ ảnh, tên file. Không phụ thuộc DOM nên test được.

// Giới hạn canvas an toàn cho mọi trình duyệt (Safari: 16384 mỗi cạnh, 268M điểm ảnh).
export const MAX_CANVAS_SIDE = 16384;
export const MAX_CANVAS_PIXELS = 250000000;
export const EXPORT_SCALES = [1, 2, 3, 4];
export const DEFAULT_EXPORT_SCALE = 3;
export const EXPORT_PADDING = 120;
export const EXPORT_FRAME_PADDING = 56;
export const EXPORT_TITLE_HEIGHT = 110;

export function normalizeExportScale(value) {
  const n = Number(value);
  return EXPORT_SCALES.includes(n) ? n : DEFAULT_EXPORT_SCALE;
}

// Chọn tỉ lệ thực tế để ảnh không vượt giới hạn canvas; thu nhỏ dần thay vì lỗi.
export function decideRasterScale({ width, height, scale = DEFAULT_EXPORT_SCALE } = {}) {
  const w = Math.max(1, Number(width) || 1);
  const h = Math.max(1, Number(height) || 1);
  const requested = normalizeExportScale(scale);
  const bySide = MAX_CANVAS_SIDE / Math.max(w, h);
  const byArea = Math.sqrt(MAX_CANVAS_PIXELS / (w * h));
  const raw = Math.min(requested, bySide, byArea);
  const effective = Math.floor(raw * 1000) / 1000;
  return {
    requested,
    scale: effective,
    limited: effective < requested,
    pixelWidth: Math.max(1, Math.floor(w * effective)),
    pixelHeight: Math.max(1, Math.floor(h * effective)),
  };
}

export function pathNumbers(pathText) {
  return String(pathText || "").match(/-?\d+(?:\.\d+)?/g)?.map(Number).filter(Number.isFinite) || [];
}

// Khung bao tất cả thẻ (boxes: {x,y,width,height}) và điểm của các đường nối, cộng lề.
export function computeContentBounds(boxes = [], pathTexts = [], padding = EXPORT_PADDING) {
  const xs = [];
  const ys = [];
  boxes.forEach((box) => {
    if (![box?.x, box?.y, box?.width, box?.height].every(Number.isFinite)) return;
    xs.push(box.x, box.x + box.width);
    ys.push(box.y, box.y + box.height);
  });
  pathTexts.forEach((d) => {
    pathNumbers(d).forEach((value, index) => (index % 2 === 0 ? xs : ys).push(value));
  });
  if (!xs.length || !ys.length) return { x: 0, y: 0, width: 1200, height: 800 };
  const minX = Math.floor(Math.min(...xs) - padding);
  const minY = Math.floor(Math.min(...ys) - padding);
  const maxX = Math.ceil(Math.max(...xs) + padding);
  const maxY = Math.ceil(Math.max(...ys) + padding);
  return { x: minX, y: minY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) };
}

export function exportSlug(value, fallback = "gia-pha") {
  const normalized = String(value || fallback)
    .trim()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  return normalized || fallback;
}

export function exportTimestamp(date = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;
}

export function exportFileName(familyName, extension = "png", date = new Date()) {
  return `gia-pha-${exportSlug(familyName)}-${exportTimestamp(date)}.${String(extension || "png").replace(/^\./, "")}`;
}

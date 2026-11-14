// Hàm số học và hình học dùng chung cho sắp xếp cây và vẽ cây. Hàm thuần, không I/O.
import { LINE_SNAP_SIZE, SNAP_SIZE } from "./config.js";

export const toInt = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : fallback;
};

export const snap = (value) => Math.round(toInt(value, 0) / SNAP_SIZE) * SNAP_SIZE;

export const snapLine = (value) => Math.round(toInt(value, 0) / LINE_SNAP_SIZE) * LINE_SNAP_SIZE;

export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export const asArray = (value) => (Array.isArray(value) ? value : []);

// Hình chữ nhật { x, y, width, height }: thẻ trên cây hoặc điểm nối của một gia đình.
export const leftX = (rect) => rect.x;
export const rightX = (rect) => rect.x + rect.width;
export const topY = (rect) => rect.y;
export const bottomY = (rect) => rect.y + rect.height;
export const centerX = (rect) => rect.x + rect.width / 2;
export const centerY = (rect) => rect.y + rect.height / 2;

export function spreadOf(values = []) {
  const safeValues = values.filter(Number.isFinite);
  if (!safeValues.length) return 0;
  return Math.max(...safeValues) - Math.min(...safeValues);
}

export function averageOf(values = []) {
  const safeValues = values.filter(Number.isFinite);
  if (!safeValues.length) return 0;
  return safeValues.reduce((sum, value) => sum + value, 0) / safeValues.length;
}

// Điểm trên mép hình chữ nhật gần `point` nhất.
export function projectPointToEdge(rect, point) {
  const x = clamp(Number(point?.x), leftX(rect), rightX(rect));
  const y = clamp(Number(point?.y), topY(rect), bottomY(rect));
  const nearest = [
    { side: "left", value: Math.abs(x - leftX(rect)) },
    { side: "right", value: Math.abs(rightX(rect) - x) },
    { side: "top", value: Math.abs(y - topY(rect)) },
    { side: "bottom", value: Math.abs(bottomY(rect) - y) },
  ].sort((a, b) => a.value - b.value)[0]?.side;

  if (nearest === "left") return { x: leftX(rect), y };
  if (nearest === "right") return { x: rightX(rect), y };
  if (nearest === "top") return { x, y: topY(rect) };
  return { x, y: bottomY(rect) };
}

// Chuỗi `d` của SVG đi qua các điểm theo đoạn ngang/dọc, bo tròn ở chỗ gấp khúc.
export function roundedElbow(points = [], radius = 16) {
  const clean = points.map((point) => ({ x: Math.round(point.x), y: Math.round(point.y) }));
  const parts = [`M ${clean[0].x} ${clean[0].y}`];
  for (let index = 1; index < clean.length; index += 1) {
    const current = clean[index];
    const next = clean[index + 1];
    const prev = clean[index - 1];
    const incomingX = current.x - prev.x;
    const incomingY = current.y - prev.y;
    const outgoingX = next ? next.x - current.x : 0;
    const outgoingY = next ? next.y - current.y : 0;
    const isElbow = Boolean(next) && (incomingX !== 0 && outgoingY !== 0 || incomingY !== 0 && outgoingX !== 0);
    if (!isElbow) {
      parts.push(`L ${current.x} ${current.y}`);
      continue;
    }
    const r = Math.min(radius, Math.hypot(incomingX, incomingY) / 2, Math.hypot(outgoingX, outgoingY) / 2);
    const beforeX = Math.round(current.x - Math.sign(incomingX) * r);
    const beforeY = Math.round(current.y - Math.sign(incomingY) * r);
    const afterX = Math.round(current.x + Math.sign(outgoingX) * r);
    const afterY = Math.round(current.y + Math.sign(outgoingY) * r);
    parts.push(`L ${beforeX} ${beforeY}`);
    parts.push(`Q ${current.x} ${current.y} ${afterX} ${afterY}`);
  }
  return parts.join(" ");
}

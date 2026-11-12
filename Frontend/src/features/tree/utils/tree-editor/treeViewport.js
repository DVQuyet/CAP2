// Vùng nhìn của cây tính theo tọa độ canvas, và cửa sổ vẽ: chỉ thẻ/đường nối giao với cửa sổ mới được render.
// Cửa sổ rộng hơn vùng nhìn (mỗi phía thêm một màn hình) và chỉ đổi khi vùng nhìn chạm mép cửa sổ,
// nên kéo nền liên tục không làm React vẽ lại từng khung hình và không lộ khoảng trống.

// Mỗi phía nới thêm bằng một lần kích thước vùng nhìn.
export const RENDER_WINDOW_MARGIN = 1;
// Phóng to nhiều làm vùng nhìn nhỏ đi: cửa sổ lớn hơn vùng nhìn quá ngần này lần (diện tích) thì tính lại.
export const RENDER_WINDOW_MAX_AREA_RATIO = 25;

// Mức chi tiết theo zoom: dưới 35% chỉ còn tên; 35–70% tên và năm; từ 70% đầy đủ (class is-zoom* trên canvas).
export const ZOOM_LEVEL_FAR_BELOW = 0.35;
export const ZOOM_LEVEL_MID_BELOW = 0.7;

export function zoomLevelFor(scale) {
  const value = Number(scale) || 1;
  if (value < ZOOM_LEVEL_FAR_BELOW) return "far";
  return value < ZOOM_LEVEL_MID_BELOW ? "mid" : "near";
}

export function viewRectFromTransform(transform, viewportWidth, viewportHeight) {
  const scale = Math.max(Number(transform?.scale) || 1, 0.01);
  const positionX = Number(transform?.positionX) || 0;
  const positionY = Number(transform?.positionY) || 0;
  return {
    left: -positionX / scale,
    top: -positionY / scale,
    right: (viewportWidth - positionX) / scale,
    bottom: (viewportHeight - positionY) / scale,
  };
}

export function expandRect(rect, ratio = RENDER_WINDOW_MARGIN) {
  const padX = (rect.right - rect.left) * ratio;
  const padY = (rect.bottom - rect.top) * ratio;
  return { left: rect.left - padX, top: rect.top - padY, right: rect.right + padX, bottom: rect.bottom + padY };
}

function area(rect) {
  return Math.max(0, rect.right - rect.left) * Math.max(0, rect.bottom - rect.top);
}

export function containsRect(outer, inner) {
  return inner.left >= outer.left && inner.top >= outer.top && inner.right <= outer.right && inner.bottom <= outer.bottom;
}

export function rectsIntersect(a, b) {
  return a.left <= b.right && a.right >= b.left && a.top <= b.bottom && a.bottom >= b.top;
}

// Trả lại đúng đối tượng cũ khi chưa cần đổi, để nơi gọi so sánh bằng === và bỏ qua setState.
export function nextRenderWindow(current, view) {
  if (!view || !(area(view) > 0)) return current;
  if (current && containsRect(current, view) && area(current) <= area(view) * RENDER_WINDOW_MAX_AREA_RATIO) return current;
  return expandRect(view);
}

export function nodeRect(node) {
  const left = Number(node?.x) || 0;
  const top = Number(node?.y) || 0;
  return { left, top, right: left + (Number(node?.width) || 0), bottom: top + (Number(node?.height) || 0) };
}

// Khung bao của một đường SVG chỉ dùng lệnh tọa độ tuyệt đối (M/L/Q/C): các số đi theo cặp x, y.
export function pathBounds(d) {
  const numbers = String(d || "").match(/-?\d+(?:\.\d+)?/g);
  if (!numbers || numbers.length < 2) return null;
  const bounds = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity };
  for (let index = 0; index + 1 < numbers.length; index += 2) {
    const x = Number(numbers[index]);
    const y = Number(numbers[index + 1]);
    if (x < bounds.left) bounds.left = x;
    if (x > bounds.right) bounds.right = x;
    if (y < bounds.top) bounds.top = y;
    if (y > bounds.bottom) bounds.bottom = y;
  }
  return bounds;
}

// Đường điều khiển (route-control) có x, y thay cho d; vùng chạm của nó rộng khoảng 28px quanh tâm.
export function lineBounds(line) {
  if (line?.d) return pathBounds(line.d);
  if (Number.isFinite(Number(line?.x)) && Number.isFinite(Number(line?.y))) {
    const x = Number(line.x);
    const y = Number(line.y);
    return { left: x - 28, top: y - 28, right: x + 28, bottom: y + 28 };
  }
  return null;
}

// Lọc theo cửa sổ vẽ; window rỗng (chưa biết vùng nhìn) thì giữ tất cả. keepIds: id luôn giữ (đang kéo, đang chọn).
export function filterNodesInWindow(nodes, renderWindow, keepIds) {
  if (!renderWindow) return nodes;
  return nodes.filter((node) => keepIds?.has(node.id) || rectsIntersect(nodeRect(node), renderWindow));
}

export function filterLinesInWindow(lines, boundsByLine, renderWindow) {
  if (!renderWindow) return lines;
  return lines.filter((line) => {
    const bounds = boundsByLine.get(line);
    return !bounds || rectsIntersect(bounds, renderWindow);
  });
}

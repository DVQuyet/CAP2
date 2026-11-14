// Đọc phần đường nối người dùng đã chỉnh tay (lineRoutes[familyId]) và chọn hướng đi của đường con cái.
import { bottomY, centerX, centerY, clamp, projectPointToEdge, snapLine, spreadOf, topY } from "../geometry.js";

// Giá trị đã lưu ở `key`; `legacyKey` là tên khóa của bản bố cục cũ còn nằm trong dữ liệu đã lưu.
export function routeNumber(route, key, legacyKey) {
  const value = Number(route?.[key]);
  if (Number.isFinite(value)) return value;
  const legacy = Number(route?.[legacyKey]);
  return Number.isFinite(legacy) ? legacy : null;
}

export function boundedRoute(route, key, legacyKey, defaultValue, min, max) {
  return snapLine(clamp(routeNumber(route, key, legacyKey) ?? defaultValue, min, max));
}

// Điểm trên mép thẻ cha mẹ nơi đường con cái bắt đầu.
export function resolveParentAnchor(route, node, defaultPoint) {
  return projectPointToEdge(node, {
    x: routeNumber(route, "parentAnchorX") ?? defaultPoint.x,
    y: routeNumber(route, "parentAnchorY") ?? defaultPoint.y,
  });
}

// "horizontal": thanh ngang phía trên các con (con nằm dưới cha mẹ).
// "vertical": trục dọc bên cạnh các con (con xếp chồng theo chiều dọc hoặc nằm ngang hàng cha mẹ).
export function resolveRouteAxis(route, parentNode, childNodes) {
  const configured = String(route?.axis || "").toLowerCase();
  if (configured === "horizontal" || configured === "vertical") return configured;

  if (childNodes.length <= 1) {
    const dx = Math.abs(centerX(childNodes[0]) - centerX(parentNode));
    const dy = Math.abs(centerY(childNodes[0]) - centerY(parentNode));
    return dy >= dx * 0.7 ? "horizontal" : "vertical";
  }
  const xSpread = spreadOf(childNodes.map(centerX));
  const ySpread = spreadOf(childNodes.map(centerY));
  const minChildTop = Math.min(...childNodes.map(topY));
  if (minChildTop >= bottomY(parentNode) - 12 && xSpread >= ySpread * 0.75) return "horizontal";
  return ySpread > xSpread * 0.65 ? "vertical" : "horizontal";
}

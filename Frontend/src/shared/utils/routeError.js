// Khóa để RouteErrorBoundary tự reset khi người dùng đổi đường dẫn.
export function routeErrorResetKey(location) {
  if (!location) return "";
  return `${location.pathname || ""}${location.search || ""}`;
}

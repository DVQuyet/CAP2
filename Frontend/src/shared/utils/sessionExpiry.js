// Logic thuần (không phụ thuộc DOM/React) cho việc xử lý phiên đăng nhập hết hạn.

// Đọc claim `exp` (giây) từ JWT mà không xác minh chữ ký. Trả null nếu không đọc được.
export function getTokenExpiry(token) {
  const parts = String(token || "").split(".");
  if (parts.length < 2) return null;
  try {
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const exp = Number(JSON.parse(atob(padded))?.exp);
    return Number.isFinite(exp) ? exp : null;
  } catch {
    return null;
  }
}

// Token đã hết hạn khi có `exp` và exp <= now. Token không đọc được thì để backend quyết định.
export function isTokenExpired(token, nowMs = Date.now()) {
  const exp = getTokenExpiry(token);
  return exp !== null && exp * 1000 <= nowMs;
}

const AUTH_PAGES = /^\/(login|register|forgot-password|auth|account-disabled|waiting|complete-profile)(\/|\?|$)/;

export function isAuthFailure(status, data) {
  if (status === 401) return true;
  return status === 403 && data?.code === "TOKEN_INVALID";
}

// Có nên xóa phiên và chuyển về đăng nhập không.
export function shouldRedirectToLogin({ status, data, hadToken, url, pathname }) {
  if (!hadToken) return false;
  if (!isAuthFailure(status, data)) return false;
  if (/\/api\/auth\//.test(String(url || ""))) return false; // đăng nhập/đăng ký tự hiện lỗi riêng
  if (AUTH_PAGES.test(String(pathname || ""))) return false;
  return true;
}

// Chỉ nhận đường dẫn tương đối cùng origin (chặn //evil.com, http://..., \\).
export function safeRedirectPath(value) {
  const path = String(value || "");
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\")) return null;
  if (AUTH_PAGES.test(path)) return null;
  return path;
}

export function buildLoginRedirect(pathname, search = "") {
  const safe = safeRedirectPath(`${pathname || "/"}${search || ""}`);
  return safe ? `/login?redirect=${encodeURIComponent(safe)}` : "/login";
}

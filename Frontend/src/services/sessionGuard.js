import i18n from "../i18n/i18n";
import { logout } from "../shared/utils/auth";
import { notify } from "../shared/utils/toast";
import { buildLoginRedirect, shouldRedirectToLogin } from "../shared/utils/sessionExpiry";

let handled = false;

// Xóa phiên, báo một lần và chuyển về /login?redirect=<trang hiện tại>.
export function expireSession() {
  if (handled || typeof window === "undefined") return;
  handled = true;
  logout();
  notify(i18n.t("auth.sessionExpired"), "info");
  window.location.assign(buildLoginRedirect(window.location.pathname, window.location.search));
}

function readHeader(init, input, name) {
  const headers = init?.headers || input?.headers;
  if (!headers) return null;
  if (typeof headers.get === "function") return headers.get(name);
  const key = Object.keys(headers).find((k) => k.toLowerCase() === name.toLowerCase());
  return key ? headers[key] : null;
}

// Bọc window.fetch: mọi response 401 / 403 TOKEN_INVALID của request có gửi token đều đưa về đăng nhập.
// ACCOUNT_DISABLED/ACCOUNT_NOT_FOUND vẫn được chuyển tới /account-disabled như trước.
export function installSessionGuard(apiBaseUrl) {
  if (typeof window === "undefined" || window.__sessionGuardInstalled) return;
  window.__sessionGuardInstalled = true;
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const response = await originalFetch(input, init);
    try {
      if (response.ok || handled || (response.status !== 401 && response.status !== 403)) return response;
      const url = typeof input === "string" ? input : input?.url || "";
      const isApi = url.startsWith("/") || (apiBaseUrl && url.startsWith(apiBaseUrl));
      if (!isApi) return response;
      const hadToken = Boolean(readHeader(init, input, "Authorization"));
      const data = await response.clone().json().catch(() => ({}));
      const code = data?.code || null;
      if (hadToken && (code === "ACCOUNT_DISABLED" || code === "ACCOUNT_NOT_FOUND") && !/\/api\/auth\//.test(url)) {
        handled = true;
        logout();
        if (window.location.pathname !== "/account-disabled") window.location.assign("/account-disabled");
        return response;
      }
      if (shouldRedirectToLogin({ status: response.status, data, hadToken, url, pathname: window.location.pathname })) {
        expireSession();
      }
    } catch {
      // không để lỗi của guard làm hỏng request
    }
    return response;
  };
}

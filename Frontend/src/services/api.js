import { logout } from "../shared/utils/auth";
const DEFAULT_API_BASE_URL = import.meta.env.PROD ? "https://cap2-backend.onrender.com" : "http://localhost:3000";
const RAW_API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  import.meta.env.VITE_API_URL ||
  DEFAULT_API_BASE_URL;

export const API_BASE_URL = String(RAW_API_BASE_URL || "").replace(/\/$/, "");

export function buildApiUrl(path = "") {
  const value = String(path || "");
  if (/^https?:\/\//i.test(value)) return value;

  const normalizedPath = value.startsWith("/") ? value : `/${value}`;
  return API_BASE_URL ? `${API_BASE_URL}${normalizedPath}` : normalizedPath;
}

async function parseResponse(response) {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return response.json();
  }
  return response.text();
}

// Phiên không còn hợp lệ (token hết hạn, tài khoản bị xóa/khóa): xóa phiên và đưa về trang phù hợp.
// Chỉ áp dụng khi request có gửi token và không phải chính các endpoint đăng nhập.
const SESSION_LOSS_CODES = new Set(["TOKEN_INVALID", "ACCOUNT_NOT_FOUND", "ACCOUNT_DISABLED"]);
let redirectingForSession = false;

function handleSessionLoss(status, data, hadToken, path) {
  if (!hadToken || redirectingForSession || typeof window === "undefined") return;
  if (String(path || "").startsWith("/api/auth/")) return;

  const code = data?.code || null;
  const lost = SESSION_LOSS_CODES.has(code) || (status === 401 && code === "NO_TOKEN");
  if (!lost) return;

  redirectingForSession = true;
  logout();
  const target = code === "ACCOUNT_DISABLED" ? "/account-disabled" : "/login";
  if (window.location.pathname !== target) window.location.assign(target);
}

export async function apiRequest(path, options = {}) {
  const token = localStorage.getItem("auth_token");
  const isFormData = options.body instanceof FormData;

  const headers = {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(isFormData ? {} : { "Content-Type": "application/json" }),
    ...(options.headers || {}),
  };

  const response = await fetch(buildApiUrl(path), {
    ...options,
    headers,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    handleSessionLoss(response.status, data, Boolean(token), path);
    const error = new Error(data.message || data.error || "Có lỗi xảy ra.");
    error.status = response.status;
    error.data = data;
    error.code = data.code || null;
    error.level = data.level || null;
    error.requiresConfirmation = Boolean(data.requiresConfirmation);
    error.billing = data.billing || null;
    throw error;
  }

  return data;
}

export function postJson(endpoint, body) {
  return apiRequest(endpoint, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

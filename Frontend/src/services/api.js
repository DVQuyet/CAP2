const DEFAULT_API_BASE_URL = import.meta.env.PROD ? "" : "http://localhost:3000";
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

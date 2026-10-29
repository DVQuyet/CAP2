import { buildApiUrl } from "../services/api";

const getAuthHeaders = () => {
  const token = localStorage.getItem("auth_token") || localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
};

// Công khai: lỗi/không có dữ liệu -> null để trang chủ dùng nội dung i18n mặc định.
export async function fetchPublicLanding(lang) {
  try {
    const res = await fetch(buildApiUrl(`/api/public/landing?lang=${lang === "en" ? "en" : "vi"}`));
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    return data && data.content ? data.content : null;
  } catch {
    return null;
  }
}

async function adminRequest(method, path, body, fallbackMessage) {
  const res = await fetch(buildApiUrl(`/api/admin/landing${path}`), {
    method,
    headers: { ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...getAuthHeaders() },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.message || fallbackMessage), { status: res.status });
  return data;
}

export const getAdminLanding = () => adminRequest("GET", "", undefined, "Không tải được nội dung trang chủ");
export const updateLandingSection = (key, body) => adminRequest("PUT", `/sections/${key}`, body, "Không lưu được mục");
export const reorderLandingSections = (keys) => adminRequest("PUT", "/sections/order", { keys }, "Không đổi được thứ tự");
export const resetLandingSection = (key) => adminRequest("DELETE", `/sections/${key}`, undefined, "Không khôi phục được mặc định");
export const createLandingItem = (key, body) => adminRequest("POST", `/sections/${key}/items`, body, "Không thêm được mục");
export const updateLandingItem = (id, body) => adminRequest("PUT", `/items/${id}`, body, "Không lưu được mục");
export const deleteLandingItem = (id) => adminRequest("DELETE", `/items/${id}`, undefined, "Không xóa được mục");
export const reorderLandingItems = (key, ids) => adminRequest("PUT", `/sections/${key}/items/order`, { ids }, "Không đổi được thứ tự");
export const seedLanding = (body) => adminRequest("POST", "/seed", body, "Không lấy được nội dung hiện tại");

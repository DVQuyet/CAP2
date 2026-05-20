import { buildApiUrl } from "../services/api";

const BASE_URL = "/api/admin";

const getAuthHeaders = () => {
  const token = localStorage.getItem("auth_token") || localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export const getAdminClans = async (period = "all") => {
  const params = new URLSearchParams();
  if (period) params.set("period", period);
  const res = await fetch(buildApiUrl(BASE_URL + "/clans?" + params.toString()), { headers: getAuthHeaders() });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || "Không lấy được danh sách dòng họ");
  return data;
};


export const createAdminClan = async (body) => {
  const res = await fetch(buildApiUrl(`${BASE_URL}/clans`), {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || "Tạo dòng họ thất bại");
  return data;
};

export const updateAdminClan = async (clanId, body) => {
  const res = await fetch(buildApiUrl(`${BASE_URL}/clans/${clanId}`), {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || "Cập nhật dòng họ thất bại");
  return data;
};

export const deleteAdminClan = async (clanId) => {
  const res = await fetch(buildApiUrl(`${BASE_URL}/clans/${clanId}`), {
    method: "DELETE",
    headers: getAuthHeaders(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || "Xóa dòng họ thất bại");
  return data;
};

export const getAdminClanTree = async (clanId) => {
  const res = await fetch(buildApiUrl(`${BASE_URL}/clans/${clanId}/tree`), { headers: getAuthHeaders() });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || "Không tải được cây phả hệ");
  return data;
};

export const getAdminClanTasks = async (clanId) => {
  const res = await fetch(buildApiUrl(`${BASE_URL}/clans/${clanId}/tasks`), { headers: getAuthHeaders() });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || "Không tải được công việc của dòng họ");
  return data;
};

export const getAdminAccounts = async () => {
  const res = await fetch(buildApiUrl(`${BASE_URL}/accounts`), { headers: getAuthHeaders() });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || "Không lấy được danh sách tài khoản");
  return data;
};


export const createAdminAccount = async (body) => {
  const res = await fetch(buildApiUrl(`${BASE_URL}/accounts`), {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || "Tạo tài khoản thất bại");
  return data;
};

export const deleteAdminAccount = async (accountId) => {
  const res = await fetch(buildApiUrl(`${BASE_URL}/accounts/${accountId}`), {
    method: "DELETE",
    headers: getAuthHeaders(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || "Xóa tài khoản thất bại");
  return data;
};
export const updateAdminAccountAccess = async (accountId, body) => {
  const res = await fetch(buildApiUrl(`${BASE_URL}/accounts/${accountId}`), {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || "Cập nhật thất bại");
  return data;
};

export const createAdminManager = async (body) => {
  const res = await fetch(buildApiUrl(`${BASE_URL}/managers`), {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || "Tạo manager thất bại");
  return data;
};

// Quản lý Thành viên
export const getAdminMembers = async () => {
  const res = await fetch(buildApiUrl(`${BASE_URL}/members`), { headers: getAuthHeaders() });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || "Không lấy được danh sách thành viên");
  return data;
};

export const updateAdminMember = async (id, body) => {
  const res = await fetch(buildApiUrl(`${BASE_URL}/members/${id}`), {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || "Cập nhật thành viên thất bại");
  return data;
};

export const deleteAdminMember = async (id) => {
  const res = await fetch(buildApiUrl(`${BASE_URL}/members/${id}`), {
    method: "DELETE",
    headers: getAuthHeaders(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || "Xóa thành viên thất bại");
  return data;
};

// Quản lý Sự kiện
export const getAdminEvents = async () => {
  const res = await fetch(buildApiUrl(`${BASE_URL}/events`), { headers: getAuthHeaders() });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || "Không lấy được danh sách sự kiện");
  return data;
};

export const createAdminEvent = async (body) => {
  const res = await fetch(buildApiUrl(`${BASE_URL}/events`), {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || "Tạo sự kiện thất bại");
  return data;
};

export const updateAdminEvent = async (id, body) => {
  const res = await fetch(buildApiUrl(`${BASE_URL}/events/${id}`), {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || "Cập nhật sự kiện thất bại");
  return data;
};

export const deleteAdminEvent = async (id) => {
  const res = await fetch(buildApiUrl(`${BASE_URL}/events/${id}`), {
    method: "DELETE",
    headers: getAuthHeaders(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || "Xóa sự kiện thất bại");
  return data;
};

// Quản lý Thư viện
export const getAdminGallery = async () => {
  const res = await fetch(buildApiUrl(`${BASE_URL}/gallery`), { headers: getAuthHeaders() });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || "Không lấy được danh sách ảnh");
  return data;
};

export const deleteAdminGalleryItem = async (id) => {
  const res = await fetch(buildApiUrl(`${BASE_URL}/gallery/${id}`), {
    method: "DELETE",
    headers: getAuthHeaders(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || "Xóa ảnh thất bại");
  return data;
};

export const getAdminDashboardStats = async (period = "all") => {
  const params = new URLSearchParams();
  if (period) params.set("period", period);
  const res = await fetch(buildApiUrl(BASE_URL + "/dashboard-stats?" + params.toString()), { headers: getAuthHeaders() });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || "Không lấy được thống kê");
  return data;
};

export const getAdminPostsByClan = async (clanId) => {
  const res = await fetch(buildApiUrl(`${BASE_URL}/posts/clan/${clanId}`), { headers: getAuthHeaders() });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || "Không lấy được danh sách bài viết");
  return data;
};

export const updateAdminPostStatus = async (postId, status) => {
  const res = await fetch(buildApiUrl(`${BASE_URL}/posts/${postId}/status`), {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify({ status }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || "Cập nhật trạng thái bài viết thất bại");
  return data;
};

export const deleteAdminPost = async (postId) => {
  const res = await fetch(buildApiUrl(`${BASE_URL}/posts/${postId}`), {
    method: "DELETE",
    headers: getAuthHeaders(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || "Xóa bài viết thất bại");
  return data;
};

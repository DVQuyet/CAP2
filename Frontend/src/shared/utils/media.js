import { API_BASE_URL } from "../../services/api";
import { getAuthToken } from "./auth";

export function normalizeMediaId(value) {
  if (value === undefined || value === null || value === "") return null;
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

// Media mới chỉ tải được khi URL có khóa truy cập (?k=, backend trả về lúc upload)
// hoặc token đăng nhập. URL dựng từ id không có khóa nên gắn token của người đang xem.
export function withMediaAccess(url) {
  if (typeof url !== "string" || !url.includes("/api/media/")) return url;
  if (/[?&](k|token)=/.test(url)) return url;
  const token = getAuthToken();
  if (!token) return url;
  return `${url}${url.includes("?") ? "&" : "?"}token=${encodeURIComponent(token)}`;
}

export function mediaUrlFromId(mediaId) {
  const id = normalizeMediaId(mediaId);
  return id ? withMediaAccess(`${API_BASE_URL}/api/media/${id}`) : "";
}

export function resolveImageUrl({ mediaId, media_id, url, imageUrl, avatar_url, image_url, fallback = "" } = {}) {
  const existingUrl = url || imageUrl || avatar_url || image_url || "";
  if (existingUrl) return withMediaAccess(existingUrl);
  return mediaUrlFromId(mediaId ?? media_id) || fallback || "";
}

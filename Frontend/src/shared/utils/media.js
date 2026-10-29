import { API_BASE_URL } from "../../services/api";
import { getMediaToken } from "./auth";
import { appendMediaToken } from "./mediaToken";

export function normalizeMediaId(value) {
  if (value === undefined || value === null || value === "") return null;
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

// Media mới chỉ tải được khi URL có khóa truy cập (?k=, backend trả về lúc upload) hoặc token media của người xem.
// URL dựng từ id không có khóa nên gắn token media (không phải JWT đăng nhập) của người đang xem.
export function withMediaAccess(url) {
  return appendMediaToken(url, getMediaToken());
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

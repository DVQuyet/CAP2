import { API_BASE_URL } from "../../services/api";

export function normalizeMediaId(value) {
  if (value === undefined || value === null || value === "") return null;
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

export function mediaUrlFromId(mediaId) {
  const id = normalizeMediaId(mediaId);
  return id ? `${API_BASE_URL}/api/media/${id}` : "";
}

export function resolveImageUrl({ mediaId, media_id, url, imageUrl, avatar_url, image_url, fallback = "" } = {}) {
  const existingUrl = url || imageUrl || avatar_url || image_url || "";
  if (existingUrl) return existingUrl;
  return mediaUrlFromId(mediaId ?? media_id) || fallback || "";
}

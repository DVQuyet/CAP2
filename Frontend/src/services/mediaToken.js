import { buildApiUrl } from "./api";
import { getAuthToken, getMediaToken, setMediaToken } from "../shared/utils/auth";

const TIMEOUT_MS = 8000;
let inflight = null;

export function needsMediaToken() {
  return Boolean(getAuthToken()) && !getMediaToken();
}

// Lấy token media (dùng trên URL ảnh/ghi âm) nếu đã đăng nhập mà chưa có. Không bao giờ ném lỗi:
// thất bại thì ảnh cần token sẽ không tải được, còn các chức năng khác vẫn chạy.
export function ensureMediaToken() {
  if (!needsMediaToken()) return Promise.resolve(getMediaToken());
  if (inflight) return inflight;

  inflight = (async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch(buildApiUrl("/api/auth/media-token"), {
        headers: { Authorization: `Bearer ${getAuthToken()}` },
        signal: controller.signal,
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok && data.media_token) setMediaToken(data.media_token);
    } catch {
      // mạng lỗi hoặc quá thời gian: bỏ qua
    } finally {
      clearTimeout(timer);
      inflight = null;
    }
    return getMediaToken();
  })();
  return inflight;
}

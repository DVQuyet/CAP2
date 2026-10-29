// Logic thuần (không phụ thuộc trình duyệt) để gắn token media vào URL ảnh/ghi âm.
// Chỉ nhận token media (scope 'media'); không bao giờ đưa JWT đăng nhập lên URL.
const MEDIA_PATH = "/api/media/";

export function appendMediaToken(url, mediaToken, { requirePath = MEDIA_PATH } = {}) {
  if (typeof url !== "string" || (requirePath && !url.includes(requirePath))) return url;
  // URL đã có khóa truy cập riêng của file (?k=) hoặc đã có token thì giữ nguyên.
  if (/[?&](k|token)=/.test(url)) return url;
  if (!mediaToken) return url;
  return `${url}${url.includes("?") ? "&" : "?"}token=${encodeURIComponent(mediaToken)}`;
}

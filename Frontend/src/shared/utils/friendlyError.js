// Đổi lỗi kỹ thuật thành khóa i18n thân thiện (common.states.error.*), không bao giờ lộ "Network Error"/"Request failed...".
// Chi tiết kỹ thuật chỉ ghi ra console.

const TECHNICAL_MESSAGE = /network ?error|failed to fetch|load failed|request failed|status code|networkerror|timeout|aborted|unexpected token|<!doctype/i;

export function friendlyErrorKey(error) {
  const status = Number(error?.status) || 0;
  if (status === 401 || status === 403) return "common.states.error.forbidden";
  if (status === 404) return "common.states.error.notFound";
  if (status >= 500 || status === 408 || status === 429) return "common.states.error.server";
  if (!status) return "common.states.error.network";
  return "common.states.error.generic";
}

// Mọi lỗi 4xx (kể cả 401/403/404) có thông điệp nghiệp vụ từ backend (tiếng Việt, do server soạn) thì giữ nguyên;
// lỗi mạng/5xx/chuỗi kỹ thuật thì dùng câu thân thiện.
export function friendlyErrorMessage(error, t) {
  if (typeof console !== "undefined" && error) console.error("[api error]", error);
  const status = Number(error?.status) || 0;
  const message = typeof error?.message === "string" ? error.message.trim() : "";
  if (status >= 400 && status < 500 && message && !TECHNICAL_MESSAGE.test(message)) {
    return message;
  }
  return t(friendlyErrorKey(error));
}

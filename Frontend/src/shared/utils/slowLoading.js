// Quyết định thông báo khi tải lâu (máy chủ Render free plan khởi động nguội mất 30-60 giây).
export const SLOW_LOADING_MS = 5000;

// Trả về khóa i18n phụ đề theo thời gian đã chờ, hoặc "" khi chưa cần.
export function slowLoadingHintKey(elapsedMs, thresholdMs = SLOW_LOADING_MS) {
  if (!Number.isFinite(elapsedMs) || elapsedMs < thresholdMs) return "";
  return "common.states.coldStart";
}

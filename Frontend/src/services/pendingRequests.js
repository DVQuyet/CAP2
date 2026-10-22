// Theo dõi các request đang chờ để hiện thông báo "máy chủ đang khởi động" (Render free tier cold start).
// Logic thuần (không phụ thuộc React/DOM) để dễ test; có thể truyền timer giả khi test.

export const SLOW_REQUEST_MS = 5000;

export function createPendingTracker({
  thresholdMs = SLOW_REQUEST_MS,
  setTimer = (fn, ms) => setTimeout(fn, ms),
  clearTimer = (id) => clearTimeout(id),
} = {}) {
  let pending = 0;
  let slow = false;
  let timerId = null;
  const listeners = new Set();

  const setSlow = (next) => {
    if (slow === next) return;
    slow = next;
    listeners.forEach((listener) => listener(slow));
  };

  return {
    // Bắt đầu một request; trả về hàm kết thúc (gọi nhiều lần cũng chỉ tính một lần).
    begin() {
      pending += 1;
      if (pending === 1 && !slow) {
        timerId = setTimer(() => {
          timerId = null;
          if (pending > 0) setSlow(true);
        }, thresholdMs);
      }
      let done = false;
      return () => {
        if (done) return;
        done = true;
        pending = Math.max(0, pending - 1);
        if (pending === 0) {
          if (timerId !== null) {
            clearTimer(timerId);
            timerId = null;
          }
          setSlow(false);
        }
      };
    },
    isSlow: () => slow,
    getPending: () => pending,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export const pendingTracker = createPendingTracker();

// Request của chat widget có thông báo riêng nên không tính vào banner toàn cục.
const IGNORED_PATH = /\/api\/chatbot(\/|\?|$)/;

// Bọc window.fetch một lần cho toàn app: mọi request tới backend đều được đếm.
export function installPendingFetchTracker(apiBaseUrl) {
  if (typeof window === "undefined" || window.__pendingFetchInstalled) return;
  window.__pendingFetchInstalled = true;
  const originalFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const url = typeof input === "string" ? input : input?.url || "";
    const isApi = url.startsWith("/") || (apiBaseUrl && url.startsWith(apiBaseUrl));
    if (!isApi || IGNORED_PATH.test(url)) return originalFetch(input, init);
    const end = pendingTracker.begin();
    return originalFetch(input, init).finally(end);
  };
}

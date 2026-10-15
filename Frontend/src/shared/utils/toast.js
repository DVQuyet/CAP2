// Thông báo nổi không chặn giao diện, thay cho window.alert.
// Dùng DOM thuần để gọi được từ bất kỳ đâu (kể cả ngoài component React).
const CONTAINER_ID = "app-toast-container";
const STYLE_ID = "app-toast-style";
const DURATION_MS = 4500;

const STYLE = `
#${CONTAINER_ID}{position:fixed;top:16px;right:16px;z-index:100000;display:flex;flex-direction:column;gap:8px;max-width:min(380px,calc(100vw - 32px));pointer-events:none}
.app-toast{pointer-events:auto;padding:12px 14px;border-radius:10px;background:#1f2937;color:#fff;font-size:14px;line-height:1.4;box-shadow:0 8px 24px rgba(0,0,0,.2);border-left:4px solid #6b7280;cursor:pointer;animation:app-toast-in .18s ease-out;word-break:break-word}
.app-toast--success{border-left-color:#16a34a}
.app-toast--error{border-left-color:#dc2626}
.app-toast--info{border-left-color:#2563eb}
@keyframes app-toast-in{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:none}}
`;

function ensureContainer() {
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = STYLE;
    document.head.appendChild(style);
  }
  let container = document.getElementById(CONTAINER_ID);
  if (!container) {
    container = document.createElement("div");
    container.id = CONTAINER_ID;
    container.setAttribute("role", "status");
    container.setAttribute("aria-live", "polite");
    document.body.appendChild(container);
  }
  return container;
}

// Đoán loại thông báo từ nội dung để các chỗ gọi cũ (alert(message)) vẫn có màu phù hợp.
function inferType(message) {
  const text = String(message || "").toLowerCase();
  if (/(lỗi|không thể|thất bại|error|failed|invalid|không hợp lệ)/.test(text)) return "error";
  if (/(thành công|success|đã lưu|đã gửi|saved)/.test(text)) return "success";
  return "info";
}

export function notify(message, type) {
  const text = String(message ?? "").trim();
  if (!text) return;
  if (typeof document === "undefined") return;

  const toast = document.createElement("div");
  toast.className = `app-toast app-toast--${type || inferType(text)}`;
  toast.textContent = text;

  const container = ensureContainer();
  const remove = () => toast.remove();
  toast.addEventListener("click", remove);
  container.appendChild(toast);
  window.setTimeout(remove, DURATION_MS);
}

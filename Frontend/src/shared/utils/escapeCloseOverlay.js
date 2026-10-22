// Nhấn Esc đóng hộp thoại (modal) trên cùng, dùng chung cho mọi modal tự dựng trong ứng dụng.
// Mỗi lần nhấn chỉ đóng một lớp: handler chạy ở pha capture và chặn lan truyền khi đã xử lý,
// nên menu/drawer/toàn màn hình bên dưới không bị đóng theo.

// Chỉ liệt kê lớp phủ (backdrop) ngoài cùng của từng loại modal.
export const OVERLAY_SELECTOR = [
  ".fte-modalOverlay",
  ".task-modal-backdrop",
  ".post-modal-backdrop",
  ".policy-modal-overlay",
  ".auth-modal-overlay",
  ".mgr-modalOverlay",
  ".tree-key-modal-overlay",
  ".premium-confirm-overlay",
  ".premium-modal-overlay",
  ".pending-pro-preview-overlay",
  ".preview-overlay",
  ".fund-modal-v2",
  ".clan-modal-backdrop",
  ".admin-modal-backdrop",
  ".memory-edit-overlay",
  ".clan-info-modalOverlay",
  ".member-clan-modalOverlay",
  ".tree-fullscreen-overlay",
  ".avatar-editor-modal",
  "[data-modal-overlay]",
].join(",");

const CLOSE_TEXT = /^(đóng|close|x|×|✕)$/i;
const CANCEL_TEXT = /^(hủy|huỷ|hủy bỏ|cancel|bỏ qua)$/i;
const CLOSE_CLASS = /close|dismiss/i;
const CANCEL_CLASS = /cancel/i;

function isVisible(node) {
  if (!node || !node.getClientRects().length) return false;
  const style = window.getComputedStyle(node);
  return style.display !== "none" && style.visibility !== "hidden";
}

// Overlay trên cùng: z-index cao nhất, bằng nhau thì phần tử nằm sau trong DOM.
export function findTopOverlay(root = document) {
  let top = null;
  let topZ = -Infinity;
  root.querySelectorAll(OVERLAY_SELECTOR).forEach((node) => {
    if (!isVisible(node)) return;
    const z = Number.parseInt(window.getComputedStyle(node).zIndex, 10);
    const zIndex = Number.isFinite(z) ? z : 0;
    if (zIndex >= topZ) {
      top = node;
      topZ = zIndex;
    }
  });
  return top;
}

const buttonLabel = (button) => (button.getAttribute("aria-label") || button.textContent || "").trim();

// Nút đóng/hủy bên trong overlay: ưu tiên nút đóng (X), sau đó nút hủy.
export function findCloseControl(overlay) {
  const buttons = Array.from(overlay.querySelectorAll("button, [role='button']"))
    .filter((button) => !button.disabled && button.getAttribute("aria-disabled") !== "true" && isVisible(button));

  const explicit = buttons.find((button) => button.hasAttribute("data-modal-close"));
  if (explicit) return explicit;

  const closeButton = buttons.find((button) => CLOSE_CLASS.test(button.className?.toString() || "")
    || CLOSE_TEXT.test(buttonLabel(button)));
  if (closeButton) return closeButton;

  return buttons.find((button) => CANCEL_CLASS.test(button.className?.toString() || "")
    || CANCEL_TEXT.test(buttonLabel(button))) || null;
}

export function dismissOverlay(overlay) {
  const control = findCloseControl(overlay);
  if (control) {
    control.click();
    return true;
  }
  // Không có nút đóng: giả lập bấm ra ngoài (nhiều modal đóng bằng mousedown hoặc click lên lớp phủ).
  ["mousedown", "mouseup", "click"].forEach((type) => {
    overlay.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
  });
  return true;
}

export function installEscapeCloseOverlay() {
  if (typeof window === "undefined") return () => {};
  const handleKeyDown = (event) => {
    if (event.key !== "Escape" || event.defaultPrevented || event.isComposing) return;
    const overlay = findTopOverlay();
    if (!overlay) return;
    event.preventDefault();
    event.stopPropagation();
    dismissOverlay(overlay);
  };
  window.addEventListener("keydown", handleKeyDown, true);
  return () => window.removeEventListener("keydown", handleKeyDown, true);
}

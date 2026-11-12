// Nháy sáng thẻ của một người sau khi nhảy tới (tìm người, "Về tôi", "Về thủy tổ"), và thời lượng hiệu ứng theo cài đặt giảm chuyển động.
// Thêm class thẳng vào DOM để không render lại cây; React không đụng class lạ khi className không đổi.
export const FLASH_CLASS = "is-flash";
export const FLASH_MS = 1400;

export function findCardElement(personId, root = typeof document === "undefined" ? null : document) {
  if (!root) return null;
  const id = Number(personId);
  if (!Number.isFinite(id)) return null;
  return root.getElementById?.(`fte-person-${id}`)
    || root.querySelector?.(`.fte-coupleCard [data-person-id="${id}"]`)
    || null;
}

export function flashTreeCard(personId, root) {
  const element = findCardElement(personId, root);
  if (!element) return false;
  element.classList.remove(FLASH_CLASS);
  // Đọc lại layout để animation chạy lại khi bấm liên tiếp vào cùng một thẻ.
  void element.offsetWidth;
  element.classList.add(FLASH_CLASS);
  window.setTimeout(() => element.classList.remove(FLASH_CLASS), FLASH_MS);
  return true;
}

// Thời lượng hiệu ứng phóng/di chuyển cây: 0 khi người dùng bật "giảm chuyển động" trong hệ điều hành.
export function motionMs(ms) {
  const reduce = typeof window !== "undefined"
    && window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  return reduce ? 0 : ms;
}

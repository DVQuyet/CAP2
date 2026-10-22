// Logic bẫy focus (Tab/Shift+Tab xoay vòng trong hộp thoại), tách riêng để test được.

// Trả về chỉ số phần tử cần focus kế tiếp; -1 nghĩa là không có phần tử focus được.
export function nextFocusIndex(count, current, backwards) {
  if (!count || count < 1) return -1;
  if (current < 0 || current >= count) return backwards ? count - 1 : 0;
  if (backwards) return current === 0 ? count - 1 : current - 1;
  return current === count - 1 ? 0 : current + 1;
}

export const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

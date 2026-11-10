import { useState } from "react";

// Thẻ "đang hoạt động" khi rê chuột hoặc có focus bên trong. Trạng thái nằm trong từng thẻ
// nên rê chuột qua một thẻ không làm các thẻ khác render lại.
export function useCardActive() {
  const [active, setActive] = useState(false);
  return [active, {
    onPointerEnter: () => setActive(true),
    onPointerLeave: () => setActive(false),
    onFocus: () => setActive(true),
    onBlur: (event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) setActive(false);
    },
  }];
}

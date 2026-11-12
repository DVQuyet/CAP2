import { useCallback, useLayoutEffect, useRef } from "react";

// Hàm có danh tính cố định nhưng luôn gọi bản mới nhất của fn: truyền xuống thẻ React.memo
// mà không làm thẻ vẽ lại mỗi lần cha render. Chỉ gọi trong sự kiện, không gọi trong lúc render.
export function useStableCallback(fn) {
  const ref = useRef(fn);
  useLayoutEffect(() => {
    ref.current = fn;
  });
  return useCallback((...args) => ref.current?.(...args), []);
}

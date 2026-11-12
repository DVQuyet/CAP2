import { useCallback } from "react";
import { flushSync } from "react-dom";

// Vị trí của thẻ trên canvas đặt bằng transform (không dùng left/top) để di chuyển không gây tính lại layout.
export const nodeTransform = (x, y) => `translate(${Math.round(Number(x) || 0)}px, ${Math.round(Number(y) || 0)}px)`;

// Kéo thẻ không qua state: trong lúc kéo chỉ đổi transform của các phần tử đang kéo, mỗi khung hình một lần.
// Thả chuột mới trả độ dời cho nơi gọi để ghi vào state và lưu, nên kéo một thẻ không làm thẻ khác render lại.
//
// startNodeDrag(event, {
//   targets: [{ element, x, y }]   phần tử DOM và vị trí gốc (tọa độ canvas) của từng thẻ bị kéo theo
//   threshold                      số px màn hình phải vượt qua mới tính là kéo (0 = kéo ngay)
//   onStart()                      gọi một lần khi bắt đầu kéo thật
//   onEnd({ moved, deltaX, deltaY }) moved=false nghĩa là chỉ bấm; delta đã làm tròn theo lưới, tính theo tọa độ canvas
// })
export function useNodeDrag({ scaleRef, snap, canvasRef }) {
  return useCallback((event, { targets = [], threshold = 0, onStart, onEnd }) => {
    const startX = event.clientX;
    const startY = event.clientY;
    let started = false;
    let frame = 0;
    let deltaX = 0;
    let deltaY = 0;

    const paint = () => {
      frame = 0;
      targets.forEach((target) => {
        if (target.element) target.element.style.transform = nodeTransform(target.x + deltaX, target.y + deltaY);
      });
    };

    const handleMove = (moveEvent) => {
      moveEvent.preventDefault();
      const screenX = moveEvent.clientX - startX;
      const screenY = moveEvent.clientY - startY;
      if (!started) {
        if (Math.hypot(screenX, screenY) < threshold) return;
        started = true;
        canvasRef?.current?.classList.add("is-nodeDragging");
        onStart?.();
      }
      const scale = scaleRef.current || 1;
      deltaX = snap(screenX / scale);
      deltaY = snap(screenY / scale);
      if (!frame) frame = window.requestAnimationFrame(paint);
    };

    const handleUp = () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleUp);
      if (frame) window.cancelAnimationFrame(frame);
      canvasRef?.current?.classList.remove("is-nodeDragging");
      // Trả DOM về vị trí React đang biết rồi ghi state ngay (flushSync) trong cùng lượt xử lý sự kiện,
      // để không có khung hình nào thẻ nhảy về chỗ cũ.
      targets.forEach((target) => {
        if (target.element) target.element.style.transform = nodeTransform(target.x, target.y);
      });
      flushSync(() => onEnd?.({ moved: started, deltaX, deltaY }));
    };

    window.addEventListener("pointermove", handleMove, { passive: false });
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("pointercancel", handleUp);
  }, [canvasRef, scaleRef, snap]);
}

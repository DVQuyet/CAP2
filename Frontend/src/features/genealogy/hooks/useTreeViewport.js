import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { nextRenderWindow, viewRectFromTransform, zoomLevelFor } from "../utils/tree-editor/treeViewport";

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

// Mức zoom và vùng nhìn của cây mà không render lại cả trình sửa theo từng khung hình:
// - mức zoom nằm trong ref; biến CSS phụ thuộc zoom ghi thẳng lên phần tử canvas;
// - React chỉ nhận state khi qua ngưỡng mức chi tiết (zoomLevel) hoặc khi cửa sổ vẽ phải dời;
// - nhãn % đọc qua scaleStore (useSyncExternalStore) nên chỉ cụm nút zoom vẽ lại.
// scaleRef do nơi gọi tạo (useRef) vì nhiều hàm kéo/thả đọc mức zoom trực tiếp từ đó.
export function useTreeViewport({ scaleRef, canvasRef, viewportRef, initialScale, farZoomTextTarget }) {
  const listenersRef = useRef(new Set());
  const windowRef = useRef(null);
  const [zoomLevel, setZoomLevel] = useState(() => zoomLevelFor(initialScale));
  const [renderWindow, setRenderWindow] = useState(null);

  const applyCanvasVars = useCallback(() => {
    const element = canvasRef.current;
    if (!element) return;
    const scale = Math.max(scaleRef.current || 1, 0.12);
    // Khi thu nhỏ, phóng chữ trên thẻ để tên vẫn đọc được (thu phóng theo ngữ nghĩa).
    element.style.setProperty("--fte2-zoom-comp", clamp(farZoomTextTarget / scale, 1, 3).toFixed(3));
    // Nghịch đảo mức zoom: đường nối giữ nguyên độ dày trên màn hình (styles/TreeLines.css).
    element.style.setProperty("--fte-inv-scale", (1 / scale).toFixed(3));
  }, [canvasRef, farZoomTextTarget, scaleRef]);

  // Canvas có thể được gắn lại (sau khi tải xong): mỗi lần render ghi lại biến CSS, rất rẻ.
  useLayoutEffect(() => {
    applyCanvasVars();
  });

  const setScale = useCallback((scale) => {
    const next = Number(scale) || initialScale;
    if (next === scaleRef.current) return;
    scaleRef.current = next;
    applyCanvasVars();
    setZoomLevel(zoomLevelFor(next));
    listenersRef.current.forEach((listener) => listener());
  }, [applyCanvasVars, initialScale, scaleRef]);

  // Gọi với state {scale, positionX, positionY} của thư viện zoom ở mỗi lần biến đổi.
  const syncView = useCallback((state) => {
    if (!state) return;
    setScale(state.scale);
    const viewport = viewportRef.current;
    if (!viewport) return;
    const view = viewRectFromTransform(state, viewport.clientWidth, viewport.clientHeight);
    const next = nextRenderWindow(windowRef.current, view);
    if (next === windowRef.current) return;
    windowRef.current = next;
    setRenderWindow(next);
  }, [setScale, viewportRef]);

  const scaleStore = useMemo(() => ({
    get: () => scaleRef.current,
    subscribe: (listener) => {
      listenersRef.current.add(listener);
      return () => listenersRef.current.delete(listener);
    },
  }), [scaleRef]);

  return { zoomLevel, renderWindow, setScale, syncView, scaleStore };
}

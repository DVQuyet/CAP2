import { useCallback, useEffect, useRef, useState } from "react";
import ConfirmDialog from "./ConfirmDialog";
import { ConfirmContext } from "./confirmContext";

export default function ConfirmProvider({ children }) {
  const [options, setOptions] = useState(null);
  const resolverRef = useRef(null);
  const triggerRef = useRef(null);

  const settle = useCallback((result) => {
    resolverRef.current?.(result);
    resolverRef.current = null;
    setOptions(null);
    // Trả focus về phần tử đã mở hộp thoại.
    const trigger = triggerRef.current;
    triggerRef.current = null;
    if (trigger && document.contains(trigger)) setTimeout(() => trigger.focus(), 0);
  }, []);

  const confirm = useCallback((opts = {}) => {
    // Nếu đang có hộp mở thì coi như hủy hộp cũ.
    resolverRef.current?.(false);
    triggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    return new Promise((resolve) => {
      resolverRef.current = resolve;
      setOptions(typeof opts === "string" ? { message: opts } : opts);
    });
  }, []);

  // Đảm bảo promise không treo khi provider bị gỡ.
  useEffect(() => () => resolverRef.current?.(false), []);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {options ? <ConfirmDialog {...options} onResolve={settle} /> : null}
    </ConfirmContext.Provider>
  );
}

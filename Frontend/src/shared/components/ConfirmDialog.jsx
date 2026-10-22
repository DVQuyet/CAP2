import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { FOCUSABLE_SELECTOR, nextFocusIndex } from "../utils/focusTrap";
import "./ConfirmDialog.css";

// Hộp xác nhận (alertdialog). Esc đóng nhờ thuộc tính data-modal-overlay + data-modal-close (xem escapeCloseOverlay).
export default function ConfirmDialog({ title, message, confirmText, cancelText, tone = "default", onResolve }) {
  const { t } = useTranslation();
  const dialogRef = useRef(null);
  const cancelRef = useRef(null);
  const danger = tone === "danger";

  // Focus vào nút Hủy (an toàn hơn cho thao tác nguy hiểm) khi mở.
  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  // Bẫy focus trong hộp thoại.
  const handleKeyDown = (event) => {
    if (event.key !== "Tab") return;
    const nodes = Array.from(dialogRef.current?.querySelectorAll(FOCUSABLE_SELECTOR) || []);
    const next = nextFocusIndex(nodes.length, nodes.indexOf(document.activeElement), event.shiftKey);
    if (next < 0) return;
    event.preventDefault();
    nodes[next].focus();
  };

  return createPortal(
    <div
      className="confirm-dialog-overlay"
      data-modal-overlay
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onResolve(false);
      }}
    >
      <div
        ref={dialogRef}
        className={`confirm-dialog ${danger ? "is-danger" : ""}`}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby={message ? "confirm-dialog-message" : undefined}
        onKeyDown={handleKeyDown}
      >
        <div className="confirm-dialog-icon" aria-hidden="true">
          <span className="material-symbols-outlined">{danger ? "warning" : "help"}</span>
        </div>
        <div className="confirm-dialog-body">
          <h3 id="confirm-dialog-title">{title || t("common.confirm.title")}</h3>
          {message ? <p id="confirm-dialog-message">{message}</p> : null}
        </div>
        <div className="confirm-dialog-actions">
          <button ref={cancelRef} type="button" className="confirm-dialog-cancel" data-modal-close onClick={() => onResolve(false)}>
            {cancelText || t("common.confirm.cancel")}
          </button>
          <button type="button" className="confirm-dialog-ok" onClick={() => onResolve(true)}>
            {confirmText || t("common.confirm.ok")}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

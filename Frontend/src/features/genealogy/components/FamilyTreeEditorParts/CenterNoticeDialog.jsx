import { createPortal } from "react-dom";
import { useLanguage } from "../../../../i18n/LanguageContext";

export default function CenterNoticeDialog({ message, onClose }) {
  const { t } = useLanguage();
  if (!message) return null;

  return createPortal(
    <div className="fte-centerNoticeOverlay" role="presentation" onMouseDown={onClose}>
      <div
        className="fte-centerNoticeDialog"
        role="alertdialog"
        aria-modal="true"
        aria-live="assertive"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="fte-centerNoticeIcon">
          <span className="material-symbols-outlined">warning</span>
        </div>
        <div className="fte-centerNoticeContent">
          <h3>{t("tree.messages.constraintViolation")}</h3>
          <p>{message}</p>
          <small>{t("tree.messages.constraintHint")}</small>
        </div>
      </div>
    </div>,
    document.body,
  );
}

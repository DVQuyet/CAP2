import { useTranslation } from "react-i18next";
import "./HelpDialog.css";

const SECTIONS = ["tree", "events", "ai", "shortcuts"];

// Hộp trợ giúp nhanh mở từ nút "?" trên thanh đầu trang. Esc đóng được nhờ thuộc tính data-modal-*.
export default function HelpDialog({ open, onClose }) {
  const { t } = useTranslation();
  if (!open) return null;

  return (
    <div className="help-dialog-overlay" data-modal-overlay role="presentation" onMouseDown={onClose}>
      <section
        className="help-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-dialog-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="help-dialog-head">
          <h2 id="help-dialog-title">{t("help.title")}</h2>
          <button type="button" data-modal-close onClick={onClose} aria-label={t("common.close")}>
            <span className="material-symbols-outlined" aria-hidden="true">close</span>
          </button>
        </header>
        <p className="help-dialog-intro">{t("help.intro")}</p>
        <dl className="help-dialog-list">
          {SECTIONS.map((key) => (
            <div key={key}>
              <dt>{t(`help.${key}.title`)}</dt>
              <dd>{t(`help.${key}.text`)}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}

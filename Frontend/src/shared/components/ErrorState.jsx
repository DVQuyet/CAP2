import { useTranslation } from "react-i18next";
import { friendlyErrorMessage } from "../utils/friendlyError";
import "./StateComponents.css";

// Lỗi tải dữ liệu: câu thân thiện + nút "Thử lại". Truyền `error` (đối tượng lỗi) hoặc `message` đã sẵn.
export default function ErrorState({ error, message, onRetry, className = "" }) {
  const { t } = useTranslation();
  const text = message || friendlyErrorMessage(error, t);

  return (
    <div className={`state-box is-error ${className}`.trim()} role="alert">
      <span className="material-symbols-outlined state-icon" aria-hidden="true">cloud_off</span>
      <strong className="state-title">{t("common.states.error.title")}</strong>
      <p className="state-hint">{text}</p>
      {onRetry && (
        <button type="button" className="state-action" onClick={onRetry}>{t("common.states.retry")}</button>
      )}
    </div>
  );
}

import { useTranslation } from "react-i18next";
import "./StateComponents.css";

// Khung chờ dạng skeleton. variant: "rows" (dòng danh sách), "cards" (lưới thẻ), "block" (một khối lớn).
export default function LoadingState({ variant = "rows", count, label, className = "" }) {
  const { t } = useTranslation();
  const items = count ?? (variant === "cards" ? 3 : variant === "block" ? 1 : 4);
  const text = label || t("common.states.loading");

  return (
    <div className={`state-loading is-${variant} ${className}`.trim()} role="status" aria-busy="true" aria-live="polite">
      <span className="state-sr-only">{text}</span>
      {Array.from({ length: items }, (_, index) => (
        <div className="state-skeleton" key={index} aria-hidden="true">
          {variant === "rows" && (
            <>
              <span className="state-skeleton-line is-short" />
              <span className="state-skeleton-line" />
            </>
          )}
          {variant === "cards" && (
            <>
              <span className="state-skeleton-line is-short" />
              <span className="state-skeleton-line" />
              <span className="state-skeleton-line" />
            </>
          )}
        </div>
      ))}
    </div>
  );
}

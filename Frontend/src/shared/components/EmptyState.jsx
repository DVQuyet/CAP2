import "./StateComponents.css";

// Trạng thái trống: icon (Material Symbols), tiêu đề, gợi ý và nút hành động tùy chọn.
export default function EmptyState({ icon = "inbox", title, hint, actionLabel, onAction, className = "" }) {
  return (
    <div className={`state-box is-empty ${className}`.trim()}>
      <span className="material-symbols-outlined state-icon" aria-hidden="true">{icon}</span>
      {title && <strong className="state-title">{title}</strong>}
      {hint && <p className="state-hint">{hint}</p>}
      {actionLabel && onAction && (
        <button type="button" className="state-action" onClick={onAction}>{actionLabel}</button>
      )}
    </div>
  );
}

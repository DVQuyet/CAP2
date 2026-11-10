// Thanh thao tác nổi dùng chung cho thẻ một người và mỗi nửa của thẻ vợ chồng.
// Thẻ chỉ render thanh này khi đang rê chuột, đang focus hoặc đang được chọn,
// nên thẻ thường không mang sẵn nút nào trong DOM.
export default function TreeCardToolbar({ actions = [], label }) {
  const visible = actions.filter(Boolean);
  if (!visible.length) return null;

  const stopPointer = (event) => {
    event.preventDefault();
    event.stopPropagation();
  };

  return (
    <div className="fte-cardToolbar" role="toolbar" aria-label={label}>
      {visible.map((action) => (
        <button
          key={action.key}
          type="button"
          className={action.tone ? `is-${action.tone}` : undefined}
          title={action.label}
          aria-label={action.label}
          onPointerDown={stopPointer}
          onClick={(event) => {
            event.stopPropagation();
            action.onClick?.();
          }}
        >
          <span className="material-symbols-outlined" aria-hidden="true">{action.icon}</span>
        </button>
      ))}
    </div>
  );
}

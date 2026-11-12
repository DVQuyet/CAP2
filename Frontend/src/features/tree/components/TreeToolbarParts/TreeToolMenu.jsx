import { useCallback, useRef, useState } from "react";
import { useLanguage } from "../../../../i18n/LanguageContext";
import { useDismiss } from "./useDismiss";

// Danh sách công cụ có nhãn, chia nhóm. Dùng cho menu "⋯" trên máy tính và bảng "Thêm" trên điện thoại.
export function TreeToolList({ groups, onPicked }) {
  return (
    <div className="fte2-toolList">
      {groups.filter((group) => group.items.some((item) => !item.hidden)).map((group) => (
        <section key={group.key} className="fte2-toolGroup" aria-label={group.label}>
          <h4>{group.label}</h4>
          {group.items.filter((item) => !item.hidden).map((item) => (
            <button
              key={item.key}
              type="button"
              className={`fte2-toolItem ${item.active ? "is-active" : ""} ${item.danger ? "is-danger" : ""}`}
              disabled={item.disabled}
              onClick={() => {
                item.onClick();
                if (!item.keepOpen) onPicked?.();
              }}
            >
              <span className="material-symbols-outlined" aria-hidden="true">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </section>
      ))}
    </div>
  );
}

export default function TreeToolMenu({ groups, styleControls }) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(ref, open, close);

  return (
    <div className="fte2-menuWrap" ref={ref}>
      <button
        type="button"
        className={`fte2-iconBtn ${open ? "is-active" : ""}`}
        aria-haspopup="menu"
        aria-expanded={open}
        title={t("tree.toolbar.more")}
        aria-label={t("tree.toolbar.more")}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="material-symbols-outlined" aria-hidden="true">more_horiz</span>
      </button>
      {open ? (
        <div className="fte2-menu" role="menu">
          <TreeToolList groups={groups} onPicked={close} />
          {styleControls ? (
            <section className="fte2-toolGroup fte2-toolGroup--style">
              <h4>{t("tree.toolbar.groupView")}</h4>
              {styleControls}
            </section>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

import { useCallback, useRef } from "react";
import { useLanguage } from "../../../../i18n/LanguageContext";
import { useDismiss } from "./useDismiss";

// Nút tròn (+) trên điện thoại: bung các thao tác có nhãn, mục cuối mở bảng công cụ.
export default function TreeMobileSpeedDial({ actions, open, onOpenChange, onOpenTools }) {
  const { t } = useLanguage();
  const dialRef = useRef(null);
  const close = useCallback(() => onOpenChange(false), [onOpenChange]);
  useDismiss(dialRef, open, close);

  return (
    <>
      {open ? <div className="fte2-mScrim" aria-hidden="true" /> : null}
      <div className={`fte2-speedDial ${open ? "is-open" : ""}`} ref={dialRef}>
        <div className="fte2-speedDialActions" aria-hidden={!open}>
          {actions.map((action, index) => (
            <button
              key={action.key}
              type="button"
              className="fte2-speedDialAction"
              style={{ "--i": actions.length - index }}
              tabIndex={open ? 0 : -1}
              disabled={action.disabled}
              onClick={() => {
                close();
                action.onClick();
              }}
            >
              <span className="fte2-speedDialLabel">{action.label}</span>
              <span className="fte2-speedDialIcon">
                <span className="material-symbols-outlined" aria-hidden="true">{action.icon}</span>
              </span>
            </button>
          ))}
          <button type="button" className="fte2-speedDialAction" style={{ "--i": 0 }} tabIndex={open ? 0 : -1} onClick={onOpenTools}>
            <span className="fte2-speedDialLabel">{t("tree.toolbar.more")}</span>
            <span className="fte2-speedDialIcon">
              <span className="material-symbols-outlined" aria-hidden="true">tune</span>
            </span>
          </button>
        </div>
        <button
          type="button"
          className="fte2-fab"
          aria-expanded={open}
          aria-label={open ? t("tree.toolbar.close") : t("tree.toolbar.actions")}
          onClick={() => onOpenChange(!open)}
        >
          <span className="material-symbols-outlined" aria-hidden="true">add</span>
        </button>
      </div>
    </>
  );
}

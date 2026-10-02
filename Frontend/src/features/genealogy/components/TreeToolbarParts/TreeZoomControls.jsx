import { useLanguage } from "../../../../i18n/LanguageContext";

// Cụm nút zoom nổi ở góc dưới phải vùng vẽ (dùng cho cả máy tính và điện thoại).
export default function TreeZoomControls({ scale, onZoomIn, onZoomOut, onFit, onToggleFullscreen, fullscreen, compact = false }) {
  const { t } = useLanguage();
  return (
    <div className={`fte2-zoom ${compact ? "is-compact" : ""}`} role="group" aria-label={t("tree.toolbar.fitScreen")}>
      <button type="button" onClick={onZoomIn} title={t("tree.toolbar.zoomIn")} aria-label={t("tree.toolbar.zoomIn")}>
        <span className="material-symbols-outlined" aria-hidden="true">add</span>
      </button>
      {compact ? null : <span className="fte2-zoomValue" aria-live="polite">{Math.round(scale * 100)}%</span>}
      <button type="button" onClick={onZoomOut} title={t("tree.toolbar.zoomOut")} aria-label={t("tree.toolbar.zoomOut")}>
        <span className="material-symbols-outlined" aria-hidden="true">remove</span>
      </button>
      <span className="fte2-zoomDivider" aria-hidden="true" />
      <button type="button" onClick={onFit} title={t("tree.toolbar.fitScreen")} aria-label={t("tree.toolbar.fitScreen")}>
        <span className="material-symbols-outlined" aria-hidden="true">fit_screen</span>
      </button>
      {onToggleFullscreen ? (
        <button
          type="button"
          onClick={onToggleFullscreen}
          className={fullscreen ? "is-active" : ""}
          title={fullscreen ? t("tree.toolbar.exitFullscreen") : t("tree.toolbar.fullscreen")}
          aria-label={fullscreen ? t("tree.toolbar.exitFullscreen") : t("tree.toolbar.fullscreen")}
        >
          <span className="material-symbols-outlined" aria-hidden="true">{fullscreen ? "close_fullscreen" : "open_in_full"}</span>
        </button>
      ) : null}
    </div>
  );
}

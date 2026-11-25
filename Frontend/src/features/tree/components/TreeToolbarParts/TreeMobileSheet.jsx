import { useLanguage } from "../../../../i18n/LanguageContext";
import TreeSearchPanel from "../TreeSearchPanel";
import TreeViewPicker from "./TreeViewPicker";
import { markToolGroups } from "./toolbarGroups";
import { TREE_DISPLAY_MODE } from "../../utils/tree-editor/treeDisplayConfig";
import { TreeToolList } from "./TreeToolMenu";

// Bảng trượt từ dưới lên trên điện thoại: tìm người / chọn cây đang xem (kèm kiểu hiển thị) / công cụ.
// Chọn xong một việc thì bảng tự đóng để người dùng thấy ngay kết quả trên cây.
export default function TreeMobileSheet({ sheet, onClose, search, rootSelector, displayMode, onDisplayModeChange, toolGroups, styleControls }) {
  const { t } = useLanguage();
  const title = { search: t("tree.toolbar.search"), view: t("tree.viewMode.title"), tools: t("tree.toolbar.more") }[sheet];
  const closeAfter = (fn) => (value) => {
    fn?.(value);
    onClose();
  };

  return (
    <>
      <button type="button" className="fte2-sheetBackdrop" aria-label={t("tree.toolbar.close")} onClick={onClose} />
      <div className="fte2-sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="fte2-sheetHandle" aria-hidden="true" />
        <div className="fte2-sheetHeader">
          <strong>{title}</strong>
          <button type="button" onClick={onClose} aria-label={t("tree.toolbar.close")}>
            <span className="material-symbols-outlined" aria-hidden="true">close</span>
          </button>
        </div>
        <div className="fte2-sheetBody">
          {sheet === "search" ? (
            <TreeSearchPanel {...search} showFindMe onFindMe={closeAfter(search.onFindMe)} onResultClick={closeAfter(search.onResultClick)} />
          ) : null}
          {sheet === "view" ? (
            <>
              <TreeViewPicker
                people={rootSelector.people}
                mode={rootSelector.mode}
                rootPersonId={rootSelector.rootPersonId}
                onFullMode={closeAfter(rootSelector.onFullMode)}
                onRootMode={closeAfter(rootSelector.onRootMode)}
              />
              <div className="fte2-segmented fte2-segmented--block tvp-mDensity" role="group" aria-label={t("tree.toolbar.viewMode")}>
                {[TREE_DISPLAY_MODE.OVERVIEW, TREE_DISPLAY_MODE.DETAIL].map((mode) => (
                  <button key={mode} type="button" className={displayMode === mode ? "is-active" : ""} aria-pressed={displayMode === mode} onClick={() => onDisplayModeChange(mode)}>
                    {t(mode === TREE_DISPLAY_MODE.OVERVIEW ? "tree.toolbar.overview" : "tree.toolbar.detail")}
                  </button>
                ))}
              </div>
            </>
          ) : null}
          {sheet === "tools" ? (
            <>
              <TreeToolList groups={markToolGroups(toolGroups)} onPicked={onClose} />
              {styleControls}
            </>
          ) : null}
        </div>
      </div>
    </>
  );
}

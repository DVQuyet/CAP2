import { useCallback, useRef, useState } from "react";
import { useLanguage } from "../../../../i18n/LanguageContext";
import TreeSearchPanel from "../TreeSearchPanel";
import TreeViewPicker from "./TreeViewPicker";
import { viewChipLabel } from "./toolbarGroups";
import { TREE_DISPLAY_MODE } from "../../utils/tree-editor/treeDisplayConfig";
import { TreeToolList } from "./TreeToolMenu";
import { useDismiss } from "./useDismiss";
import "./TreeToolbar.css";

// Điều khiển trên điện thoại: hàng trên cùng có "Tìm người" và nút chọn cây đang xem; nút tròn (+) bung các
// thao tác có nhãn; bảng trượt từ dưới lên cho tìm kiếm / xem cây (cả kiểu hiển thị) / công cụ.
export default function TreeMobileControls({
  speedDialActions,
  search,
  rootSelector,
  displayMode,
  onDisplayModeChange,
  toolGroups,
  styleControls,
}) {
  const { t } = useLanguage();
  const [dialOpen, setDialOpen] = useState(false);
  const [sheet, setSheet] = useState(null);
  const dialRef = useRef(null);
  const closeDial = useCallback(() => setDialOpen(false), []);
  useDismiss(dialRef, dialOpen, closeDial);

  const openSheet = (name) => {
    setDialOpen(false);
    setSheet(name);
  };

  const actions = speedDialActions.filter((action) => !action.hidden && action.key !== "findMe"); // "Tìm tôi" đã có trong bảng tìm kiếm
  const sheetTitle = { search: t("tree.toolbar.search"), view: t("tree.viewMode.title"), tools: t("tree.toolbar.more") }[sheet];
  const closeAfter = (fn) => (value) => { fn(value); setSheet(null); };

  return (
    <>
      <div className="tvp-mTop">
        <button type="button" className="fte2-mSearchFab" onClick={() => openSheet("search")} aria-label={t("tree.toolbar.search")}>
          <span className="material-symbols-outlined" aria-hidden="true">search</span>
          <span>{t("tree.toolbar.search")}</span>
        </button>
        <button type="button" className={`fte2-mSearchFab tvp-mChip ${rootSelector.mode === "root" ? "is-active" : ""}`} onClick={() => openSheet("view")}>
          <span className="material-symbols-outlined" aria-hidden="true">{rootSelector.mode === "root" ? "account_tree" : "groups"}</span>
          <span className="fte2-chipText">{viewChipLabel(t, rootSelector)}</span>
        </button>
      </div>

      {dialOpen ? <div className="fte2-mScrim" aria-hidden="true" /> : null}

      <div className={`fte2-speedDial ${dialOpen ? "is-open" : ""}`} ref={dialRef}>
        <div className="fte2-speedDialActions" aria-hidden={!dialOpen}>
          {actions.map((action, index) => (
            <button
              key={action.key}
              type="button"
              className="fte2-speedDialAction"
              style={{ "--i": actions.length - index }}
              tabIndex={dialOpen ? 0 : -1}
              disabled={action.disabled}
              onClick={() => {
                setDialOpen(false);
                action.onClick();
              }}
            >
              <span className="fte2-speedDialLabel">{action.label}</span>
              <span className="fte2-speedDialIcon">
                <span className="material-symbols-outlined" aria-hidden="true">{action.icon}</span>
              </span>
            </button>
          ))}
          <button
            type="button"
            className="fte2-speedDialAction"
            style={{ "--i": 0 }}
            tabIndex={dialOpen ? 0 : -1}
            onClick={() => openSheet("tools")}
          >
            <span className="fte2-speedDialLabel">{t("tree.toolbar.more")}</span>
            <span className="fte2-speedDialIcon">
              <span className="material-symbols-outlined" aria-hidden="true">tune</span>
            </span>
          </button>
        </div>
        <button
          type="button"
          className="fte2-fab"
          aria-expanded={dialOpen}
          aria-label={dialOpen ? t("tree.toolbar.close") : t("tree.toolbar.actions")}
          onClick={() => setDialOpen((value) => !value)}
        >
          <span className="material-symbols-outlined" aria-hidden="true">add</span>
        </button>
      </div>

      {sheet ? (
        <>
          <button type="button" className="fte2-sheetBackdrop" aria-label={t("tree.toolbar.close")} onClick={() => setSheet(null)} />
          <div className="fte2-sheet" role="dialog" aria-modal="true" aria-label={sheetTitle}>
            <div className="fte2-sheetHandle" aria-hidden="true" />
            <div className="fte2-sheetHeader">
              <strong>{sheetTitle}</strong>
              <button type="button" onClick={() => setSheet(null)} aria-label={t("tree.toolbar.close")}>
                <span className="material-symbols-outlined" aria-hidden="true">close</span>
              </button>
            </div>
            <div className="fte2-sheetBody">
              {sheet === "search" ? (
                <TreeSearchPanel {...search} showFindMe onResultClick={closeAfter(search.onResultClick)} />
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
                  <TreeToolList groups={toolGroups} onPicked={() => setSheet(null)} />
                  {styleControls}
                </>
              ) : null}
            </div>
          </div>
        </>
      ) : null}
    </>
  );
}

import { useCallback, useRef, useState } from "react";
import { useLanguage } from "../../../../i18n/LanguageContext";
import TreeSearchPanel from "../TreeSearchPanel";
import { TREE_DISPLAY_MODE } from "../../utils/tree-editor/treeDisplayConfig";
import TreeToolMenu from "./TreeToolMenu";
import TreeViewPicker from "./TreeViewPicker";
import { splitToolbarActions, viewChipLabel } from "./toolbarGroups";
import { useDismiss } from "./useDismiss";
import "./TreeToolbar.css";

// Thanh công cụ máy tính, ba cụm theo việc người dùng làm:
// tìm người | xem cây nào, xem gọn hay chi tiết | thêm người, bố cục, xuất ảnh, ⋯
export default function TreeToolbar({ search, rootSelector, displayMode, onDisplayModeChange, primaryActions, toolGroups, styleControls, badge }) {
  const { t } = useLanguage();
  const [viewOpen, setViewOpen] = useState(false);
  const viewRef = useRef(null);
  const closeView = useCallback(() => setViewOpen(false), []);
  useDismiss(viewRef, viewOpen, closeView);
  const rootActive = rootSelector.mode === "root";
  const { buttons, layoutItems, otherGroups } = splitToolbarActions(primaryActions, toolGroups);

  return (
    <div className="fte2-toolbar" role="toolbar" aria-label={t("tree.toolbar.actions")}>
      <div className="fte2-toolbarSearch">
        <TreeSearchPanel variant="compact" showFindMe showClear={Boolean(search.submittedQuery)} {...search} />
      </div>

      <div className="tvp-group" role="group" aria-label={t("tree.viewMode.title")}>
        <div className="fte2-menuWrap" ref={viewRef}>
          <button type="button" className={`fte2-chipBtn tvp-chip ${rootActive ? "is-active" : ""}`} aria-haspopup="dialog" aria-expanded={viewOpen} onClick={() => setViewOpen((value) => !value)}>
            <span className="material-symbols-outlined" aria-hidden="true">{rootActive ? "account_tree" : "groups"}</span>
            <span className="fte2-chipText">{viewChipLabel(t, rootSelector)}</span>
            <span className="material-symbols-outlined tvp-caret" aria-hidden="true">expand_more</span>
          </button>
          {rootActive ? (
            <button type="button" className="tvp-clear" onClick={rootSelector.onFullMode} aria-label={t("tree.viewMode.backToWhole")} title={t("tree.viewMode.backToWhole")}>
              <span className="material-symbols-outlined" aria-hidden="true">close</span>
            </button>
          ) : null}
          {viewOpen ? (
            <div className="fte2-menu fte2-menu--root" role="dialog" aria-label={t("tree.viewMode.title")}>
              <TreeViewPicker
                people={rootSelector.people}
                mode={rootSelector.mode}
                rootPersonId={rootSelector.rootPersonId}
                onFullMode={() => { rootSelector.onFullMode(); closeView(); }}
                onRootMode={(personId) => { rootSelector.onRootMode(personId); closeView(); }}
              />
            </div>
          ) : null}
        </div>

        <div className="fte2-segmented" role="group" aria-label={t("tree.toolbar.viewMode")}>
          {[TREE_DISPLAY_MODE.OVERVIEW, TREE_DISPLAY_MODE.DETAIL].map((mode) => (
            <button key={mode} type="button" className={displayMode === mode ? "is-active" : ""} aria-pressed={displayMode === mode} onClick={() => onDisplayModeChange(mode)}>
              {t(mode === TREE_DISPLAY_MODE.OVERVIEW ? "tree.toolbar.overview" : "tree.toolbar.detail")}
            </button>
          ))}
        </div>
      </div>

      <div className="fte2-toolbarSpacer" />
      {badge ? <span className="fte2-badge">{badge}</span> : null}

      <div className="fte2-toolbarActions">
        {buttons.map((action) => (
          <button
            key={action.key}
            type="button"
            className={action.primary ? "fte2-primaryBtn" : "fte2-chipBtn"}
            onClick={action.onClick}
            disabled={action.disabled}
            title={action.title || action.label}
          >
            <span className="material-symbols-outlined" aria-hidden="true">{action.icon}</span>
            <span className="tvp-btnLabel">{action.label}</span>
          </button>
        ))}
        {layoutItems.length ? (
          <TreeToolMenu label={t("tree.toolbar.layoutMenu")} icon="dashboard_customize" groups={[{ key: "layout", label: "", items: layoutItems }]} />
        ) : null}
        <TreeToolMenu groups={otherGroups} styleControls={styleControls} />
      </div>
    </div>
  );
}

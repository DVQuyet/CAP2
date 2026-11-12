import { useCallback, useRef, useState } from "react";
import { useLanguage } from "../../../../i18n/LanguageContext";
import TreeSearchPanel from "../TreeSearchPanel";
import TreeViewModeSelector from "../TreeViewModeSelector";
import { TREE_DISPLAY_MODE } from "../../utils/tree-editor/treeDisplayConfig";
import TreeToolMenu from "./TreeToolMenu";
import { useDismiss } from "./useDismiss";

// Thanh công cụ máy tính gọn trong một hàng: tìm kiếm | kiểu hiển thị | thao tác chính | menu "⋯".
export default function TreeToolbar({
  search,
  rootSelector,
  displayMode,
  onDisplayModeChange,
  primaryActions,
  toolGroups,
  styleControls,
  badge,
}) {
  const { t } = useLanguage();
  const [rootOpen, setRootOpen] = useState(false);
  const rootRef = useRef(null);
  const closeRoot = useCallback(() => setRootOpen(false), []);
  useDismiss(rootRef, rootOpen, closeRoot);
  const rootActive = rootSelector.mode === "root";

  return (
    <div className="fte2-toolbar" role="toolbar" aria-label={t("tree.toolbar.actions")}>
      <div className="fte2-toolbarSearch">
        <TreeSearchPanel variant="compact" showFindMe showClear={Boolean(search.submittedQuery)} {...search} />
      </div>

      <div className="fte2-menuWrap" ref={rootRef}>
        <button
          type="button"
          className={`fte2-chipBtn ${rootActive ? "is-active" : ""}`}
          aria-expanded={rootOpen}
          onClick={() => setRootOpen((value) => !value)}
          title={t("tree.toolbar.rootPerson")}
        >
          <span className="material-symbols-outlined" aria-hidden="true">account_tree</span>
          <span className="fte2-chipText">{rootActive && rootSelector.rootName ? rootSelector.rootName : t("tree.toolbar.rootPerson")}</span>
        </button>
        {rootOpen ? (
          <div className="fte2-menu fte2-menu--root">
            <TreeViewModeSelector
              people={rootSelector.people}
              mode={rootSelector.mode}
              rootPersonId={rootSelector.rootPersonId}
              onFullMode={() => {
                rootSelector.onFullMode();
                closeRoot();
              }}
              onRootMode={(personId) => {
                rootSelector.onRootMode(personId);
                closeRoot();
              }}
            />
          </div>
        ) : null}
      </div>

      <div className="fte2-toolbarSpacer" />

      {badge ? <span className="fte2-badge">{badge}</span> : null}

      <div className="fte2-segmented" role="group" aria-label={t("tree.toolbar.viewMode")}>
        {[TREE_DISPLAY_MODE.OVERVIEW, TREE_DISPLAY_MODE.DETAIL].map((mode) => (
          <button
            key={mode}
            type="button"
            className={displayMode === mode ? "is-active" : ""}
            aria-pressed={displayMode === mode}
            onClick={() => onDisplayModeChange(mode)}
          >
            {t(mode === TREE_DISPLAY_MODE.OVERVIEW ? "tree.toolbar.overview" : "tree.toolbar.detail")}
          </button>
        ))}
      </div>

      <div className="fte2-toolbarActions">
        {primaryActions.filter((action) => !action.hidden).map((action) => (
          <button
            key={action.key}
            type="button"
            className={action.primary ? "fte2-primaryBtn" : "fte2-iconBtn"}
            onClick={action.onClick}
            disabled={action.disabled}
            title={action.title || action.label}
            aria-label={action.label}
          >
            <span className="material-symbols-outlined" aria-hidden="true">{action.icon}</span>
            {action.primary ? <span>{action.label}</span> : null}
          </button>
        ))}
        <TreeToolMenu groups={toolGroups} styleControls={styleControls} />
      </div>
    </div>
  );
}

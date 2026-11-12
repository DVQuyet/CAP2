import { useCallback, useRef, useState } from "react";
import { useLanguage } from "../../../../i18n/LanguageContext";
import TreeSearchPanel from "../TreeSearchPanel";
import TreeViewModeSelector from "../TreeViewModeSelector";
import { TREE_DISPLAY_MODE } from "../../utils/tree-editor/treeDisplayConfig";
import { TreeToolList } from "./TreeToolMenu";
import { useDismiss } from "./useDismiss";

// Điều khiển trên điện thoại kiểu Facebook: nút tròn nổi (+) bung ra các thao tác có nhãn,
// nút tìm kiếm nổi phía trên, và bảng trượt từ dưới lên cho tìm kiếm / công cụ.
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

  const actions = speedDialActions.filter((action) => !action.hidden);

  return (
    <>
      <button type="button" className="fte2-mSearchFab" onClick={() => openSheet("search")} aria-label={t("tree.toolbar.search")}>
        <span className="material-symbols-outlined" aria-hidden="true">search</span>
        <span>{t("tree.toolbar.search")}</span>
      </button>

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
          <div className="fte2-sheet" role="dialog" aria-modal="true" aria-label={sheet === "search" ? t("tree.toolbar.search") : t("tree.toolbar.more")}>
            <div className="fte2-sheetHandle" aria-hidden="true" />
            <div className="fte2-sheetHeader">
              <strong>{sheet === "search" ? t("tree.toolbar.search") : t("tree.toolbar.more")}</strong>
              <button type="button" onClick={() => setSheet(null)} aria-label={t("tree.toolbar.close")}>
                <span className="material-symbols-outlined" aria-hidden="true">close</span>
              </button>
            </div>
            <div className="fte2-sheetBody">
              {sheet === "search" ? (
                <>
                  <TreeSearchPanel
                    {...search}
                    showFindMe
                    onResultClick={(person) => {
                      search.onResultClick(person);
                      setSheet(null);
                    }}
                  />
                  <div className="fte2-sheetSection">
                    <TreeViewModeSelector
                      people={rootSelector.people}
                      mode={rootSelector.mode}
                      rootPersonId={rootSelector.rootPersonId}
                      onFullMode={() => {
                        rootSelector.onFullMode();
                        setSheet(null);
                      }}
                      onRootMode={(personId) => {
                        rootSelector.onRootMode(personId);
                        setSheet(null);
                      }}
                    />
                  </div>
                </>
              ) : (
                <>
                  <div className="fte2-segmented fte2-segmented--block" role="group" aria-label={t("tree.toolbar.viewMode")}>
                    {[TREE_DISPLAY_MODE.OVERVIEW, TREE_DISPLAY_MODE.DETAIL].map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        className={displayMode === mode ? "is-active" : ""}
                        onClick={() => onDisplayModeChange(mode)}
                      >
                        {t(mode === TREE_DISPLAY_MODE.OVERVIEW ? "tree.toolbar.overview" : "tree.toolbar.detail")}
                      </button>
                    ))}
                  </div>
                  <TreeToolList groups={toolGroups} onPicked={() => setSheet(null)} />
                  {styleControls}
                </>
              )}
            </div>
          </div>
        </>
      ) : null}
    </>
  );
}

import { useState } from "react";
import { useLanguage } from "../../../../i18n/LanguageContext";
import TreeMobileSpeedDial from "./TreeMobileSpeedDial";
import TreeMobileSheet from "./TreeMobileSheet";
import { viewChipLabel } from "./toolbarGroups";
import "./TreeToolbar.css";

// Điều khiển trên điện thoại: hàng trên cùng có "Tìm người" và nút chọn cây đang xem; nút tròn (+) bung các
// thao tác có nhãn; bảng trượt từ dưới lên cho tìm kiếm / xem cây (cả kiểu hiển thị) / công cụ.
export default function TreeMobileControls({ speedDialActions, search, rootSelector, displayMode, onDisplayModeChange, toolGroups, styleControls }) {
  const { t } = useLanguage();
  const [dialOpen, setDialOpen] = useState(false);
  const [sheet, setSheet] = useState(null);
  const openSheet = (name) => {
    setDialOpen(false);
    setSheet(name);
  };
  // "Tìm tôi" đã có trong bảng tìm kiếm nên không lặp ở nút tròn.
  const actions = speedDialActions.filter((action) => !action.hidden && action.key !== "findMe");

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
      <TreeMobileSpeedDial actions={actions} open={dialOpen} onOpenChange={setDialOpen} onOpenTools={() => openSheet("tools")} />
      {sheet ? (
        <TreeMobileSheet
          sheet={sheet}
          onClose={() => setSheet(null)}
          search={search}
          rootSelector={rootSelector}
          displayMode={displayMode}
          onDisplayModeChange={onDisplayModeChange}
          toolGroups={toolGroups}
          styleControls={styleControls}
        />
      ) : null}
    </>
  );
}

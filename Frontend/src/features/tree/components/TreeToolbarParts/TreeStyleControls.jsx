import { useLanguage } from "../../../../i18n/LanguageContext";
import { TREE_CARD_ORIENTATION, TREE_THEMES } from "../../utils/tree-editor/treeDisplayConfig";

// Tuỳ chỉnh giao diện cây: chủ đề màu, hướng thẻ, màu nền, cỡ chữ.
export default function TreeStyleControls({ treeStyle, onChange }) {
  const { t } = useLanguage();
  return (
    <div className="fte2-styleControls">
      <div className="fte2-field">
        <span className="fte2-fieldLabel">{t("tree.toolbar.theme")}</span>
        <div className="fte2-themeChips" role="radiogroup" aria-label={t("tree.toolbar.theme")}>
          {TREE_THEMES.map((theme) => (
            <button
              key={theme}
              type="button"
              role="radio"
              aria-checked={treeStyle.theme === theme}
              className={`fte2-themeChip is-${theme} ${treeStyle.theme === theme ? "is-active" : ""}`}
              onClick={() => onChange({ theme, backgroundColor: null })}
            >
              <span className="fte2-themeSwatch" aria-hidden="true" />
              {t(`tree.themes.${theme}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="fte2-field">
        <span className="fte2-fieldLabel">{t("tree.toolbar.viewMode")}</span>
        <div className="fte2-segmented" role="group">
          <button
            type="button"
            className={treeStyle.cardOrientation === TREE_CARD_ORIENTATION.HORIZONTAL ? "is-active" : ""}
            onClick={() => onChange({ cardOrientation: TREE_CARD_ORIENTATION.HORIZONTAL })}
          >
            <span className="material-symbols-outlined" aria-hidden="true">view_agenda</span>
            {t("tree.toolbar.cardHorizontal")}
          </button>
          <button
            type="button"
            className={treeStyle.cardOrientation === TREE_CARD_ORIENTATION.VERTICAL ? "is-active" : ""}
            onClick={() => onChange({ cardOrientation: TREE_CARD_ORIENTATION.VERTICAL })}
          >
            <span className="material-symbols-outlined" aria-hidden="true">view_column</span>
            {t("tree.toolbar.cardVertical")}
          </button>
        </div>
      </div>

      <div className="fte2-fieldRow">
        <label className="fte2-field fte2-colorField">
          <span className="fte2-fieldLabel">{t("tree.toolbar.background")}</span>
          <input
            type="color"
            value={treeStyle.backgroundColor || "#f8f2e8"}
            onChange={(event) => onChange({ backgroundColor: event.target.value })}
          />
        </label>
        <label className="fte2-field fte2-rangeField">
          <span className="fte2-fieldLabel">{t("tree.toolbar.textSize")} · {treeStyle.fontSize}px</span>
          <input
            type="range"
            min="12"
            max="28"
            value={treeStyle.fontSize}
            onChange={(event) => onChange({ fontSize: Number(event.target.value) })}
          />
        </label>
      </div>
    </div>
  );
}

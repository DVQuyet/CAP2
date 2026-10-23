import { useState } from "react";
import { useLanguage } from "../../../../i18n/LanguageContext";
import { friendlyErrorMessage } from "../../../../shared/utils/friendlyError";
import { DEFAULT_TREE_EXPORT_OPTIONS, TREE_EXPORT_FORMAT, TREE_EXPORT_MODE } from "../../utils/tree-editor/treeExportConfig";
import { EXPORT_SCALES } from "../../utils/tree-editor/treeExportMath";
import TreeStyleControls from "../TreeToolbarParts/TreeStyleControls";

const FORMATS = [TREE_EXPORT_FORMAT.PNG, TREE_EXPORT_FORMAT.SVG];

// Hộp thoại xuất ảnh. onExport(options, onProgress) tự dựng và tải file; lỗi hiện ngay trong hộp thoại.
export default function TreeExportDialog({ treeStyle, onTreeStyleChange, onClose, onExport }) {
  const { t } = useLanguage();
  const [options, setOptions] = useState(DEFAULT_TREE_EXPORT_OPTIONS);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ step: "", ratio: 0 });
  const [error, setError] = useState("");
  const update = (patch) => setOptions((current) => ({ ...current, ...patch }));

  const submit = async () => {
    setBusy(true);
    setError("");
    setProgress({ step: "fonts", ratio: 0.05 });
    try {
      await onExport(options, (step, ratio) => setProgress({ step, ratio }));
      onClose();
    } catch (err) {
      console.error("Export tree failed:", err);
      setError(friendlyErrorMessage(err, t));
      setBusy(false);
    }
  };

  return (
    <div className="fte-modalOverlay" role="presentation" onMouseDown={() => !busy && onClose()}>
      <div className="fte-modal fte-exportModal" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
        <div className="fte-modalHeader">
          <div>
            <span>{t("tree.export.eyebrow")}</span>
            <h3>{t("tree.export.title")}</h3>
          </div>
          <button type="button" className="fte-iconButton" onClick={onClose} disabled={busy} title={t("common.close")}>
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="fte-exportGrid">
          <section>
            <h4>{t("tree.export.mode")}</h4>
            {[
              { value: TREE_EXPORT_MODE.OVERVIEW, label: t("tree.toolbar.overview") },
              { value: TREE_EXPORT_MODE.DETAIL, label: t("tree.toolbar.detail") },
            ].map((item) => (
              <label key={item.value} className="fte-radioRow">
                <input
                  type="radio"
                  name="exportMode"
                  value={item.value}
                  checked={(options.mode || TREE_EXPORT_MODE.DETAIL) === item.value}
                  disabled={busy}
                  onChange={() => update({ mode: item.value })}
                />
                <span>{item.label}</span>
              </label>
            ))}
          </section>

          <section>
            <h4>{t("tree.export.format")}</h4>
            <div className="fte-segmented">
              {FORMATS.map((format) => (
                <button key={format} type="button" className={options.format === format ? "is-active" : ""} onClick={() => update({ format })} disabled={busy}>
                  {format.toUpperCase()}
                </button>
              ))}
            </div>
            <button type="button" className="fte-pdfStub" disabled>
              {t("tree.export.pdfSoon")}
            </button>
            <small className="fte-exportHint">{options.format === TREE_EXPORT_FORMAT.SVG ? t("tree.export.svgHint") : t("tree.export.pngHint")}</small>
          </section>

          <section>
            <h4>{t("tree.export.quality")}</h4>
            <div className="fte-segmented">
              {EXPORT_SCALES.map((quality) => (
                <button
                  key={quality}
                  type="button"
                  className={Number(options.quality) === quality ? "is-active" : ""}
                  onClick={() => update({ quality })}
                  disabled={busy || options.format === TREE_EXPORT_FORMAT.SVG}
                >
                  {quality}x
                </button>
              ))}
            </div>
          </section>

          <section>
            <h4>{t("tree.export.options")}</h4>
            <label className="fte-checkRow">
              <input type="checkbox" checked={options.includeBackground} onChange={(event) => update({ includeBackground: event.target.checked })} disabled={busy} />
              <span>{t("tree.export.background")}</span>
            </label>
            <label className="fte-checkRow">
              <input type="checkbox" checked={options.includeTitle} onChange={(event) => update({ includeTitle: event.target.checked })} disabled={busy} />
              <span>{t("tree.export.includeTitle")}</span>
            </label>
            <label className="fte-checkRow" title={t("tree.export.frameHint")}>
              <input type="checkbox" checked={Boolean(options.includeFrame)} onChange={(event) => update({ includeFrame: event.target.checked })} disabled={busy} />
              <span>{t("tree.export.frame")}</span>
            </label>
          </section>

          <section className="fte2 fte2-exportAppearance" data-tree-theme={treeStyle?.theme}>
            <h4>{t("tree.export.appearance")}</h4>
            <TreeStyleControls treeStyle={treeStyle} onChange={onTreeStyleChange} />
          </section>
        </div>

        {busy ? (
          <div className="fte-exportProgress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress.ratio * 100)}>
            <span style={{ width: `${Math.round(progress.ratio * 100)}%` }} />
            <small>{t(`tree.export.steps.${progress.step || "fonts"}`)}</small>
          </div>
        ) : null}
        {error ? <p className="fte-exportError" role="alert">{error}</p> : null}

        <div className="fte-modalFooter">
          <button type="button" className="fte-ghostButton" onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </button>
          <button type="button" className="fte-primaryButton" onClick={submit} disabled={busy}>
            <span className="material-symbols-outlined">{busy ? "progress_activity" : "download"}</span>
            {busy ? t("tree.export.exporting") : t("tree.export.submit")}
          </button>
        </div>
      </div>
    </div>
  );
}

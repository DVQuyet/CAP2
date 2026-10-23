import { useState } from "react";
import { useLanguage } from "../../../../i18n/LanguageContext";
import { friendlyErrorMessage } from "../../../../shared/utils/friendlyError";
import { TREE_EXPORT_FORMAT } from "../../utils/tree-editor/treeExportConfig";
import { DEFAULT_EXPORT_SCALE, EXPORT_SCALES } from "../../utils/tree-editor/treeExportMath";

const FORMATS = [TREE_EXPORT_FORMAT.PNG, TREE_EXPORT_FORMAT.SVG];

// Hộp thoại xuất ảnh tối giản: chỉ chọn định dạng (PNG/SVG) và tỉ lệ. onExport(options, onProgress) tự tải file.
export default function TreeExportDialog({ onClose, onExport }) {
  const { t } = useLanguage();
  const [format, setFormat] = useState(TREE_EXPORT_FORMAT.PNG);
  const [quality, setQuality] = useState(DEFAULT_EXPORT_SCALE);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ step: "", ratio: 0 });
  const [error, setError] = useState("");

  const submit = async () => {
    setBusy(true);
    setError("");
    setProgress({ step: "fonts", ratio: 0.05 });
    try {
      await onExport({ format, quality }, (step, ratio) => setProgress({ step, ratio }));
      onClose();
    } catch (err) {
      console.error("Export tree failed:", err);
      setError(friendlyErrorMessage(err, t));
      setBusy(false);
    }
  };

  return (
    <div className="fte-modalOverlay" role="presentation" onMouseDown={() => !busy && onClose()}>
      <div className="fte-modal fte-exportModal is-compact" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
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
            <h4>{t("tree.export.format")}</h4>
            <div className="fte-segmented">
              {FORMATS.map((item) => (
                <button key={item} type="button" className={format === item ? "is-active" : ""} onClick={() => setFormat(item)} disabled={busy}>
                  {item.toUpperCase()}
                </button>
              ))}
            </div>
            <small className="fte-exportHint">{format === TREE_EXPORT_FORMAT.SVG ? t("tree.export.svgHint") : t("tree.export.pngHint")}</small>
          </section>

          <section>
            <h4>{t("tree.export.quality")}</h4>
            <div className="fte-segmented">
              {EXPORT_SCALES.map((item) => (
                <button
                  key={item}
                  type="button"
                  className={quality === item ? "is-active" : ""}
                  onClick={() => setQuality(item)}
                  disabled={busy || format === TREE_EXPORT_FORMAT.SVG}
                >
                  {item}x
                </button>
              ))}
            </div>
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

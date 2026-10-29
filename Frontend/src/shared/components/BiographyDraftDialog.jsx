import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { generateBiographyDraftAPI } from "../../api/aiServerService";
import { friendlyErrorMessage } from "../utils/friendlyError";
import { FOCUSABLE_SELECTOR, nextFocusIndex } from "../utils/focusTrap";
import LoadingState from "./LoadingState";
import "./BiographyDraftDialog.css";

// Hộp thoại "AI soạn tiểu sử / lời tưởng niệm". AI chỉ soạn BẢN NHÁP từ dữ liệu trên cây:
// người dùng đọc, sửa, bấm "Dùng bản này" (điền vào ô tiểu sử) rồi tự bấm Lưu như thường lệ.
export default function BiographyDraftDialog({ personId, isDeceased = false, onUse, onClose }) {
  const { t, i18n } = useTranslation();
  const dialogRef = useRef(null);
  const [options, setOptions] = useState({ purpose: "biography", tone: "formal", length: "short" });
  const [status, setStatus] = useState("idle"); // idle | loading | done | error
  const [result, setResult] = useState(null);
  const [text, setText] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    dialogRef.current?.querySelector("select")?.focus();
  }, []);

  const handleKeyDown = (event) => {
    if (event.key !== "Tab") return;
    const nodes = Array.from(dialogRef.current?.querySelectorAll(FOCUSABLE_SELECTOR) || []);
    const next = nextFocusIndex(nodes.length, nodes.indexOf(document.activeElement), event.shiftKey);
    if (next < 0) return;
    event.preventDefault();
    nodes[next].focus();
  };

  const setOption = (key, value) => setOptions((current) => ({ ...current, [key]: value }));

  const generate = async () => {
    setStatus("loading");
    setError("");
    try {
      const data = await generateBiographyDraftAPI(personId, {
        ...options,
        language: String(i18n.language || "vi").startsWith("en") ? "en" : "vi",
      });
      setResult(data);
      setText(data.draft || "");
      setStatus("done");
    } catch (err) {
      setError(friendlyErrorMessage(err, t));
      setStatus("error");
    }
  };

  const select = (key, values) => (
    <select value={options[key]} onChange={(event) => setOption(key, event.target.value)} disabled={status === "loading"}>
      {values.map((value) => (
        <option key={value} value={value}>{t(`biographyDraft.${key}.${value}`)}</option>
      ))}
    </select>
  );

  return createPortal(
    <div
      className="bio-draft-overlay"
      data-modal-overlay
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && status !== "loading") onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="bio-draft-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bio-draft-title"
        onKeyDown={handleKeyDown}
      >
        <h3 id="bio-draft-title">{t("biographyDraft.title")}</h3>
        <p className="bio-draft-hint">{t("biographyDraft.hint")}</p>

        <div className="bio-draft-options">
          <label>
            {t("biographyDraft.purpose.label")}
            {select("purpose", isDeceased ? ["biography", "memorial"] : ["biography"])}
          </label>
          <label>
            {t("biographyDraft.tone.label")}
            {select("tone", ["formal", "warm"])}
          </label>
          <label>
            {t("biographyDraft.length.label")}
            {select("length", ["short", "medium"])}
          </label>
        </div>

        {status === "loading" ? <LoadingState variant="block" label={t("biographyDraft.generating")} /> : null}
        {status === "error" ? <p className="bio-draft-error" role="alert">{error}</p> : null}

        {status === "done" && result ? (
          <div className="bio-draft-result">
            {result.source === "template" ? <span className="bio-draft-badge">{t("biographyDraft.templateBadge")}</span> : null}
            <label>
              <span className="state-sr-only">{t("biographyDraft.resultLabel")}</span>
              <textarea value={text} onChange={(event) => setText(event.target.value)} aria-label={t("biographyDraft.resultLabel")} />
            </label>
            {result.facts_used?.length ? (
              <details className="bio-draft-facts">
                <summary>{t("biographyDraft.factsUsed")}</summary>
                <ul>
                  {result.facts_used.map((fact) => <li key={fact}>{fact}</li>)}
                </ul>
              </details>
            ) : null}
            <p className="bio-draft-hint">{t("biographyDraft.reviewNote")}</p>
          </div>
        ) : null}

        <div className="bio-draft-actions">
          <button type="button" data-modal-close onClick={onClose}>{t("biographyDraft.close")}</button>
          <button type="button" onClick={generate} disabled={status === "loading"}>
            {status === "done" || status === "error" ? t("biographyDraft.regenerate") : t("biographyDraft.generate")}
          </button>
          {status === "done" ? (
            <button type="button" className="is-primary" onClick={() => onUse(text.trim())} disabled={!text.trim()}>
              {t("biographyDraft.use")}
            </button>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}

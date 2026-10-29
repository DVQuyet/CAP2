import { useState } from "react";
import { useLanguage } from "../../../../i18n/LanguageContext";
import { useConfirm } from "../../../../shared/components/confirmContext.js";
import { generatePersonBiographyAI } from "../../../../api/aiServerService";

// Nút "AI gợi ý tiểu sử": chỉ điền bản nháp vào ô tiểu sử, người dùng tự xem lại và bấm lưu.
export default function BiographyAIButton({ personId, currentBio = "", onDraft, disabled = false }) {
  const { t, language } = useLanguage();
  const confirm = useConfirm();
  const [open, setOpen] = useState(false);
  const [tone, setTone] = useState("formal");
  const [length, setLength] = useState("short");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const generate = async () => {
    if (loading || !personId) return;
    setError("");
    setDone(false);
    setLoading(true);
    try {
      const result = await generatePersonBiographyAI({
        person_id: personId,
        tone,
        length,
        language: language === "en" ? "en" : "vi",
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      });
      const draft = String(result?.biography || "").trim();
      if (!draft) throw new Error(t("tree.inspector.bioAi.error"));
      if (String(currentBio || "").trim()) {
        const ok = await confirm({
          message: t("tree.inspector.bioAi.confirmReplace"),
          confirmText: t("tree.inspector.bioAi.replace"),
        });
        if (!ok) return;
      }
      onDraft(draft);
      setDone(true);
    } catch (err) {
      setError(err?.status === 503 ? t("tree.inspector.bioAi.unavailable") : err?.message || t("tree.inspector.bioAi.error"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fte-bioAi is-wide">
      <button type="button" className="fte-bioAiToggle" onClick={() => setOpen((value) => !value)} disabled={disabled} aria-expanded={open}>
        {t("tree.inspector.bioAi.button")}
      </button>
      {open ? (
        <div className="fte-bioAiPanel">
          <p className="fte-bioAiHint">{t("tree.inspector.bioAi.hint")}</p>
          <div className="fte-bioAiRow">
            <label>
              {t("tree.inspector.bioAi.tone")}
              <select value={tone} onChange={(event) => setTone(event.target.value)} disabled={loading}>
                <option value="formal">{t("tree.inspector.bioAi.toneFormal")}</option>
                <option value="friendly">{t("tree.inspector.bioAi.toneFriendly")}</option>
              </select>
            </label>
            <label>
              {t("tree.inspector.bioAi.length")}
              <select value={length} onChange={(event) => setLength(event.target.value)} disabled={loading}>
                <option value="short">{t("tree.inspector.bioAi.lengthShort")}</option>
                <option value="medium">{t("tree.inspector.bioAi.lengthMedium")}</option>
              </select>
            </label>
          </div>
          <label>
            {t("tree.inspector.bioAi.notes")}
            <textarea
              rows={2}
              maxLength={600}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder={t("tree.inspector.bioAi.notesPlaceholder")}
              disabled={loading}
            />
          </label>
          <button type="button" className="fte-bioAiRun" onClick={generate} disabled={loading || disabled}>
            {loading ? t("tree.inspector.bioAi.loading") : t("tree.inspector.bioAi.button")}
          </button>
          {error ? <div className="fte-bioAiError" role="alert">{error}</div> : null}
          {done ? <div className="fte-bioAiDone" role="status">{t("tree.inspector.bioAi.done")}</div> : null}
        </div>
      ) : null}
    </div>
  );
}

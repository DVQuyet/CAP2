import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiRequest } from "../../../services/api";
import { generatePostDraftAI } from "../../../api/aiServerService";
import { useConfirm } from "../../../shared/components/confirmContext.js";
import { formatIsoShort, pickUpcomingEvents, toIsoLocal } from "../postAiHelpers";

// "AI soạn giúp": điền tiêu đề + nội dung nháp vào form đăng bài; chưa lưu gì cho đến khi người dùng gửi bài.
export default function PostAIAssist({ hasContent = false, disabled = false, onDraft }) {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const [open, setOpen] = useState(false);
  const [idea, setIdea] = useState("");
  const [kind, setKind] = useState("");
  const [tone, setTone] = useState("formal");
  const [eventId, setEventId] = useState("");
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [warnings, setWarnings] = useState([]);
  const [done, setDone] = useState(false);

  // Nạp sự kiện sắp tới (30 ngày) một lần khi mở panel.
  useEffect(() => {
    if (!open || events.length) return undefined;
    let cancelled = false;
    const today = new Date();
    const end = new Date(today.getTime() + 30 * 24 * 3600 * 1000);
    const from = toIsoLocal(today);
    apiRequest(`/api/calendar/events?from=${from}&to=${toIsoLocal(end)}`)
      .then((data) => { if (!cancelled) setEvents(pickUpcomingEvents(data?.events, from)); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [open, events.length]);

  const canRun = Boolean(idea.trim() || eventId);

  const generate = async () => {
    if (loading || !canRun) return;
    setError("");
    setWarnings([]);
    setDone(false);
    setLoading(true);
    try {
      const result = await generatePostDraftAI({
        tone,
        ...(kind ? { kind } : {}),
        ...(idea.trim() ? { idea: idea.trim() } : {}),
        ...(eventId ? { event_id: eventId } : {}),
      });
      const content = String(result?.content || "").trim();
      if (!content) throw new Error(t("posts.modal.ai.error"));
      if (hasContent) {
        const ok = await confirm({
          message: t("posts.modal.ai.confirmReplace"),
          confirmText: t("posts.modal.ai.replace"),
        });
        if (!ok) return;
      }
      onDraft({ title: String(result?.title || "").trim(), content });
      setWarnings(Array.isArray(result?.unverified) ? result.unverified : []);
      setDone(true);
    } catch (err) {
      if (err?.status === 503) setError(t("posts.modal.ai.unavailable"));
      else if (err?.status === 404) setError(t("posts.modal.ai.eventNotFound"));
      else setError(err?.message || t("posts.modal.ai.error"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="post-ai">
      <button type="button" className="post-ai-toggle" onClick={() => setOpen((value) => !value)} disabled={disabled} aria-expanded={open}>
        <span className="material-symbols-outlined" aria-hidden="true">auto_awesome</span>
        {t("posts.modal.ai.button")}
      </button>
      {open ? (
        <div className="post-ai-panel">
          <p className="post-ai-hint">{t("posts.modal.ai.hint")}</p>
          {events.length ? (
            <label>
              {t("posts.modal.ai.eventLabel")}
              <select value={eventId} onChange={(event) => setEventId(event.target.value)} disabled={loading}>
                <option value="">{t("posts.modal.ai.eventNone")}</option>
                {events.map((event) => (
                  <option key={event.id} value={event.id}>{`${formatIsoShort(event.date)} - ${event.title}`}</option>
                ))}
              </select>
            </label>
          ) : null}
          <label>
            {t("posts.modal.ai.ideaLabel")}
            <textarea
              rows={3}
              maxLength={1000}
              value={idea}
              onChange={(event) => setIdea(event.target.value)}
              placeholder={t("posts.modal.ai.ideaPlaceholder")}
              disabled={loading}
            />
          </label>
          <div className="post-ai-row">
            <label>
              {t("posts.modal.ai.kindLabel")}
              <select value={kind} onChange={(event) => setKind(event.target.value)} disabled={loading}>
                <option value="">{t("posts.modal.ai.kind.auto")}</option>
                <option value="meeting">{t("posts.modal.ai.kind.meeting")}</option>
                <option value="anniversary">{t("posts.modal.ai.kind.anniversary")}</option>
                <option value="celebration">{t("posts.modal.ai.kind.celebration")}</option>
                <option value="general">{t("posts.modal.ai.kind.general")}</option>
              </select>
            </label>
            <label>
              {t("posts.modal.ai.toneLabel")}
              <select value={tone} onChange={(event) => setTone(event.target.value)} disabled={loading}>
                <option value="formal">{t("posts.modal.ai.tone.formal")}</option>
                <option value="friendly">{t("posts.modal.ai.tone.friendly")}</option>
              </select>
            </label>
          </div>
          <button type="button" className="post-ai-run" onClick={generate} disabled={loading || disabled || !canRun}>
            {loading ? t("posts.modal.ai.loading") : t("posts.modal.ai.run")}
          </button>
          {error ? <div className="post-ai-error" role="alert">{error}</div> : null}
          {done ? <div className="post-ai-done" role="status">{t("posts.modal.ai.done")}</div> : null}
          {warnings.length ? (
            <div className="post-ai-warning" role="status">{t("posts.modal.ai.unverified", { items: warnings.join(", ") })}</div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

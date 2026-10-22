import { useState } from "react";
import { useTranslation } from "react-i18next";
import RelationshipCard from "./RelationshipCard";
import { apiRequest } from "../../../services/api";
import { sendChatbotFeedback } from "../../../api/chatbotService";
import { getFeedbackMessageId, getInitialFeedbackRating, getMessagePersonIds, nextFeedbackState } from "../utils/feedbackState";

// Nút hành động trợ lý đề xuất (ví dụ "Thêm vào lịch"). Chỉ lưu khi người dùng bấm.
function AssistantAction({ action }) {
  const { t } = useTranslation();
  const [state, setState] = useState("idle");
  const [error, setError] = useState("");
  if (action?.type !== "create_calendar_event" || !action.payload) return null;

  const run = async () => {
    setState("saving");
    setError("");
    try {
      await apiRequest("/api/calendar/events", {
        method: "POST",
        body: JSON.stringify(action.payload),
      });
      setState("done");
    } catch (actionError) {
      setState("idle");
      setError(actionError?.message || t("aiChat.calendarFailed"));
    }
  };

  return (
    <div className="ai-message-action">
      <button type="button" onClick={run} disabled={state !== "idle"}>
        <span className="material-symbols-outlined" aria-hidden="true">{state === "done" ? "event_available" : "calendar_add_on"}</span>
        {state === "done" ? t("aiChat.calendarDone") : state === "saving" ? t("aiChat.calendarSaving") : action.label || t("aiChat.calendarAdd")}
      </button>
      {error ? <small role="alert">{error}</small> : null}
    </div>
  );
}

// Hàng nút dưới bong bóng trợ lý: 👍/👎 (kèm ô góp ý khi 👎) và "Xem trên cây".
function MessageActions({ message, onViewOnTree }) {
  const { t } = useTranslation();
  const feedbackId = getFeedbackMessageId(message);
  const personIds = getMessagePersonIds(message);
  const [rating, setRating] = useState(() => getInitialFeedbackRating(message));
  const [error, setError] = useState("");
  const [askComment, setAskComment] = useState(false);
  const [comment, setComment] = useState("");
  const [thanks, setThanks] = useState(false);
  const [sending, setSending] = useState(false);

  if (!feedbackId && !personIds.length) return null;

  const submit = async (nextRating, text) => {
    const previous = rating;
    setRating(nextRating);
    setError("");
    setSending(true);
    try {
      await sendChatbotFeedback(feedbackId, nextRating, text);
      if (text) setThanks(true);
    } catch {
      setRating(previous);
      setAskComment(false);
      setError(t("aiChat.feedbackError"));
    } finally {
      setSending(false);
    }
  };

  const handleRate = (clicked) => {
    const next = nextFeedbackState(rating, clicked);
    if (!next.send || sending) return;
    setThanks(false);
    setAskComment(clicked === -1);
    submit(next.rating);
  };

  const sendComment = (event) => {
    event.preventDefault();
    const text = comment.trim();
    setAskComment(false);
    if (text) submit(-1, text);
  };

  return (
    <>
      <div className="ai-msg-actions">
        {feedbackId ? (
          <>
            <button type="button" aria-pressed={rating === 1} aria-label={t("aiChat.feedbackHelpful")} title={t("aiChat.feedbackHelpful")} onClick={() => handleRate(1)} disabled={sending}>
              <span className="material-symbols-outlined" aria-hidden="true">thumb_up</span>
            </button>
            <button type="button" aria-pressed={rating === -1} aria-label={t("aiChat.feedbackNotHelpful")} title={t("aiChat.feedbackNotHelpful")} onClick={() => handleRate(-1)} disabled={sending}>
              <span className="material-symbols-outlined" aria-hidden="true">thumb_down</span>
            </button>
          </>
        ) : null}
        {personIds.length ? (
          <button type="button" title={t("aiChat.viewOnTreeTitle")} onClick={() => onViewOnTree?.(personIds)}>
            <span className="material-symbols-outlined" aria-hidden="true">account_tree</span>
            {t("aiChat.viewOnTree")}
          </button>
        ) : null}
      </div>
      {askComment ? (
        <form className="ai-feedback-comment" onSubmit={sendComment}>
          <input
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            placeholder={t("aiChat.feedbackCommentPlaceholder")}
            aria-label={t("aiChat.feedbackCommentLabel")}
            maxLength={500}
            autoComplete="off"
          />
          <button type="submit" disabled={!comment.trim()}>{t("aiChat.feedbackSend")}</button>
          <button type="button" onClick={() => setAskComment(false)}>{t("aiChat.feedbackSkip")}</button>
        </form>
      ) : null}
      {thanks ? <small className="ai-feedback-note" role="status">{t("aiChat.feedbackThanks")}</small> : null}
      {error ? <small className="ai-feedback-note is-error" role="alert">{error}</small> : null}
    </>
  );
}

export default function MessageBubble({ message, onCandidatePick, onRetry, onViewOnTree }) {
  const { t } = useTranslation();
  const isUser = message.role === "user";
  const candidates = message.candidates || message.metadata?.candidates || [];
  const actions = message.actions || message.metadata?.actions || [];

  return (
    <div className={`ai-message-row ${isUser ? "from-user" : "from-assistant"}`}>
      <div className="ai-message-stack">
        <div className={`ai-message ${isUser ? "ai-msg-user" : "ai-msg-bot"}`}>
          <p>{message.content || message.message || message.answer}</p>
          {!isUser ? <RelationshipCard message={message} /> : null}
          {!isUser && candidates.length ? (
            <div className="ai-candidate-list">
              {candidates.map((candidate) => (
                <button
                  key={candidate.id}
                  type="button"
                  onClick={() => onCandidatePick?.(candidate)}
                >
                  <span>{candidate.description || candidate.name}</span>
                  {!candidate.description ? (
                    <small>{candidate.generation ? t("aiChat.generation", { n: candidate.generation }) : t("aiChat.generationUnknown")}</small>
                  ) : null}
                </button>
              ))}
            </div>
          ) : null}
          {!isUser && message.retryText ? (
            <button type="button" className="ai-retry-btn" onClick={() => onRetry?.(message.retryText, message.retryExtra)}>
              <span className="material-symbols-outlined" aria-hidden="true">refresh</span>
              {t("aiChat.retry")}
            </button>
          ) : null}
          {!isUser && actions.length ? actions.map((action, index) => (
            <AssistantAction key={`${action.type}-${index}`} action={action} />
          )) : null}
        </div>
        {!isUser ? <MessageActions message={message} onViewOnTree={onViewOnTree} /> : null}
      </div>
    </div>
  );
}

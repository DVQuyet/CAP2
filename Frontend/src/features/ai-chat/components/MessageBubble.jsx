import { useState } from "react";
import { useTranslation } from "react-i18next";
import RelationshipCard from "./RelationshipCard";
import { apiRequest } from "../../../services/api";

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

export default function MessageBubble({ message, onCandidatePick, onRetry }) {
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
        {/* Chỗ cho hàng nút nhỏ dưới bong bóng trợ lý: <div className="ai-msg-actions">...</div> (chỉ khi !isUser). */}
      </div>
    </div>
  );
}

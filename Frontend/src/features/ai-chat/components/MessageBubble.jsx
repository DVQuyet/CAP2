import { useState } from "react";
import RelationshipCard from "./RelationshipCard";
import { apiRequest } from "../../../services/api";

// Nút hành động trợ lý đề xuất (ví dụ "Thêm vào lịch"). Chỉ lưu khi người dùng bấm.
function AssistantAction({ action }) {
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
      setError(actionError?.message || "Không thêm được vào lịch.");
    }
  };

  return (
    <div className="ai-message-action">
      <button type="button" onClick={run} disabled={state !== "idle"}>
        <span className="material-symbols-outlined" aria-hidden="true">{state === "done" ? "event_available" : "calendar_add_on"}</span>
        {state === "done" ? "Đã thêm vào lịch" : state === "saving" ? "Đang lưu..." : action.label || "Thêm vào lịch"}
      </button>
      {error ? <small role="alert">{error}</small> : null}
    </div>
  );
}

export default function MessageBubble({ message, onCandidatePick }) {
  const isUser = message.role === "user";
  const candidates = message.candidates || message.metadata?.candidates || [];
  const actions = message.actions || message.metadata?.actions || [];

  return (
    <div className={`ai-message-row ${isUser ? "from-user" : "from-assistant"}`}>
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
                <span>{candidate.name}</span>
                <small>{candidate.generation ? `Đời ${candidate.generation}` : "Chưa rõ đời"}</small>
              </button>
            ))}
          </div>
        ) : null}
        {!isUser && actions.length ? actions.map((action, index) => (
          <AssistantAction key={`${action.type}-${index}`} action={action} />
        )) : null}
      </div>
    </div>
  );
}

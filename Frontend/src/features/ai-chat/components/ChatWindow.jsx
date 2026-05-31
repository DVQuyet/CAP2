import { useEffect, useMemo, useRef, useState } from "react";
import { askChatbot, getChatbotHistory, getChatbotSuggestions } from "../../../api/chatbotService";
import MessageBubble from "./MessageBubble";
import PersonContextSelector from "./PersonContextSelector";
import SuggestionChips from "./SuggestionChips";
import TypingIndicator from "./TypingIndicator";
import VoiceInputButton from "./VoiceInputButton";

const MAX_RENDERED_MESSAGES = 120;

function makeLocalMessage(role, content, extra = {}) {
  return {
    id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    role,
    content,
    created_at: new Date().toISOString(),
    ...extra,
  };
}

export default function ChatWindow({
  context,
  contextLoading,
  contextError,
  people = [],
  peopleLoading,
  onBindPerson,
  onClose,
}) {
  const [messages, setMessages] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedTargetId, setSelectedTargetId] = useState(null);
  const listRef = useRef(null);

  const ready = Boolean(context?.clanId && context?.currentMemberId);
  const needsPersonSelection = Boolean(context?.clanId && !context?.currentMemberId);
  const renderedMessages = useMemo(
    () => messages.slice(Math.max(messages.length - MAX_RENDERED_MESSAGES, 0)),
    [messages],
  );

  useEffect(() => {
    if (!ready) return undefined;
    let cancelled = false;
    getChatbotSuggestions({ clanId: context.clanId, currentMemberId: context.currentMemberId })
      .then((data) => {
        if (!cancelled) setSuggestions(data.suggestions || []);
      })
      .catch(() => {});
    getChatbotHistory({ clanId: context.clanId, currentMemberId: context.currentMemberId, limit: 40 })
      .then((data) => {
        if (!cancelled && Array.isArray(data.messages)) {
          setMessages(data.messages.map((item) => ({
            id: item.id,
            role: item.role === "assistant" ? "assistant" : "user",
            content: item.message,
            metadata: item.metadata,
            created_at: item.created_at,
          })));
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [ready, context?.clanId, context?.currentMemberId]);

  useEffect(() => {
    const node = listRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [renderedMessages.length, loading]);

  const sendMessage = async (text = input) => {
    const messageText = String(text || "").trim();
    if (!messageText || loading || !ready) return;
    setInput("");
    setLoading(true);
    setMessages((prev) => [...prev, makeLocalMessage("user", messageText)]);
    try {
      const data = await askChatbot({
        message: messageText,
        clanId: context.clanId,
        currentMemberId: context.currentMemberId,
        targetPersonId: selectedTargetId,
      });
      setMessages((prev) => [
        ...prev,
        makeLocalMessage("assistant", data.answer || "Tôi chưa có câu trả lời.", {
          metadata: data,
          candidates: data.candidates || [],
        }),
      ]);
    } catch (error) {
      const data = error?.data || {};
      setMessages((prev) => [
        ...prev,
        makeLocalMessage("assistant", data.answer || error?.message || "Không thể xử lý câu hỏi.", {
          metadata: data,
          candidates: data.candidates || [],
        }),
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleCandidatePick = (candidate) => {
    setSelectedTargetId(candidate.id);
    setInput(`Tôi gọi ${candidate.name} bằng gì?`);
  };

  const handleTranscript = (transcript, errorMessage) => {
    if (errorMessage) {
      setMessages((prev) => [...prev, makeLocalMessage("assistant", errorMessage)]);
      return;
    }
    if (transcript) {
      setInput(transcript);
      sendMessage(transcript);
    }
  };

  return (
    <section className="ai-chat-window" aria-label="AI Family Assistant">
      <header className="ai-chat-header">
        <div>
          <strong>AI Family Assistant</strong>
          <small>Trả lời dựa trên dữ liệu gia phả</small>
        </div>
        <button type="button" className="ai-icon-btn" onClick={onClose} aria-label="Đóng">
          <span className="material-symbols-outlined">close</span>
        </button>
      </header>

      <div className="ai-chat-messages" ref={listRef}>
        {contextLoading ? (
          <div className="ai-empty-state">Đang xác định dòng họ và thành viên hiện tại...</div>
        ) : null}
        {!contextLoading && contextError ? (
          <div className="ai-empty-state">{contextError}</div>
        ) : null}
        {!contextLoading && needsPersonSelection ? (
          <PersonContextSelector
            people={people}
            loading={peopleLoading}
            error={contextError}
            onSelect={onBindPerson}
          />
        ) : null}
        {!contextLoading && !needsPersonSelection && !ready ? (
          <div className="ai-empty-state">Chưa xác định được dòng họ hoặc thành viên hiện tại.</div>
        ) : null}
        {renderedMessages.map((message) => (
          <MessageBubble key={message.id} message={message} onCandidatePick={handleCandidatePick} />
        ))}
        {loading ? <TypingIndicator /> : null}
      </div>

      <SuggestionChips suggestions={suggestions} onPick={sendMessage} />

      <form
        className="ai-chat-input"
        onSubmit={(event) => {
          event.preventDefault();
          sendMessage();
        }}
      >
        <VoiceInputButton disabled={!ready || loading} onTranscript={handleTranscript} />
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Hỏi về quan hệ gia đình..."
          disabled={!ready || loading}
        />
        <button type="submit" className="ai-send-btn" disabled={!input.trim() || !ready || loading} aria-label="Gửi">
          <span className="material-symbols-outlined">send</span>
        </button>
      </form>
    </section>
  );
}

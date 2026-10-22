import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
  const inputRef = useRef(null);
  const [messages, setMessages] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const listRef = useRef(null);

  // Hỏi được ngay khi biết dòng họ; câu cần "tôi" thì trợ lý sẽ nhắc chọn người trong cây.
  const ready = Boolean(context?.clanId);
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

  // extra: thông tin kèm theo câu hỏi, vd { clarificationChoice } khi người dùng chọn một người lúc được hỏi lại.
  const sendMessage = async (text = input, extra = {}) => {
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
        ...extra,
      });
      // Gợi ý câu hỏi tiếp theo theo câu trả lời vừa nhận (vd về người vừa hỏi tới).
      const nextSuggestions = (Array.isArray(data.suggestions) ? data.suggestions : [])
        .map((item, index) => ({ id: `reply-${Date.now()}-${index}`, text: typeof item === "string" ? item : item?.text }))
        .filter((item) => item.text);
      if (nextSuggestions.length) setSuggestions(nextSuggestions);
      setMessages((prev) => [
        ...prev,
        makeLocalMessage("assistant", data.answer || t("aiChat.noAnswer"), {
          metadata: data,
          candidates: data.candidates || [],
        }),
      ]);
    } catch (error) {
      const data = error?.data || {};
      setMessages((prev) => [
        ...prev,
        makeLocalMessage("assistant", data.answer || error?.message || t("aiChat.errorFallback"), {
          metadata: data,
          candidates: data.candidates || [],
          // Lỗi mạng/máy chủ (không phải câu trả lời của trợ lý): cho thử lại đúng câu vừa hỏi.
          retryText: data.answer ? null : messageText,
          retryExtra: data.answer ? null : extra,
        }),
      ]);
    } finally {
      setLoading(false);
    }
  };

  // Chọn một người khi trợ lý hỏi lại (trùng tên): gửi lựa chọn để trợ lý trả lời đúng câu hỏi ban đầu.
  const handleCandidatePick = (candidate) => {
    const label = candidate.description || `${candidate.name}${candidate.generation ? t("aiChat.generationParen", { n: candidate.generation }) : ""}`;
    sendMessage(t("aiChat.pickLabel", { label }),{ clarificationChoice: candidate.id });
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

  // Mở cửa sổ: đưa con trỏ vào ô nhập ngay khi hỏi được.
  useEffect(() => {
    if (ready && !loading) inputRef.current?.focus();
  }, [ready, loading]);

  const exampleQuestions = [t("aiChat.example1"), t("aiChat.example2"), t("aiChat.example3")];
  const showWelcome = ready && !contextLoading && !needsPersonSelection && messages.length === 0 && !loading;

  const handleKeyDown = (event) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      onClose?.();
    }
  };

  return (
    <section className="ai-chat-window" role="dialog" aria-label={t("aiChat.windowLabel")} onKeyDown={handleKeyDown}>
      <header className="ai-chat-header">
        <span className="ai-chat-avatar" aria-hidden="true">
          <span className="material-symbols-outlined">account_tree</span>
        </span>
        <div className="ai-chat-heading">
          <strong>{t("aiChat.title")}</strong>
          <small>{t("aiChat.subtitle")}</small>
        </div>
        <button type="button" className="ai-icon-btn" onClick={onClose} aria-label={t("aiChat.close")} title={t("aiChat.close")}>
          <span className="material-symbols-outlined" aria-hidden="true">close</span>
        </button>
      </header>

      <div className="ai-chat-messages" ref={listRef} role="log" aria-live="polite" aria-relevant="additions">
        {contextLoading ? (
          <div className="ai-empty-state" role="status">{t("aiChat.loadingContext")}</div>
        ) : null}
        {!contextLoading && contextError ? (
          <div className="ai-empty-state is-error" role="alert">{contextError}</div>
        ) : null}
        {!contextLoading && needsPersonSelection ? (
          <PersonContextSelector
            people={people}
            loading={peopleLoading}
            error={contextError}
            onSelect={onBindPerson}
          />
        ) : null}
        {!contextLoading && !ready ? (
          <div className="ai-empty-state">{t("aiChat.contextMissing")}</div>
        ) : null}
        {showWelcome ? (
          <div className="ai-welcome">
            <span className="ai-welcome-icon" aria-hidden="true">
              <span className="material-symbols-outlined">forum</span>
            </span>
            <h3>{t("aiChat.welcomeTitle")}</h3>
            <p>{t("aiChat.welcomeBody")}</p>
            <div className="ai-welcome-examples">
              {exampleQuestions.map((question) => (
                <button key={question} type="button" onClick={() => sendMessage(question)}>
                  <span className="material-symbols-outlined" aria-hidden="true">chat_bubble</span>
                  <span>{question}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}
        {renderedMessages.map((message) => (
          <MessageBubble
            key={message.id}
            message={message}
            onCandidatePick={handleCandidatePick}
            onRetry={(text, extra) => sendMessage(text, extra || {})}
          />
        ))}
        {loading ? <TypingIndicator /> : null}
      </div>

      <SuggestionChips suggestions={suggestions} onPick={sendMessage} disabled={!ready || loading} />

      <form
        className="ai-chat-input"
        onSubmit={(event) => {
          event.preventDefault();
          sendMessage();
        }}
      >
        <VoiceInputButton disabled={!ready || loading} onTranscript={handleTranscript} />
        <input
          ref={inputRef}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder={t("aiChat.placeholder")}
          aria-label={t("aiChat.placeholder")}
          autoComplete="off"
          enterKeyHint="send"
          disabled={!ready || loading}
        />
        <button type="submit" className="ai-send-btn" disabled={!input.trim() || !ready || loading} aria-label={t("aiChat.send")} title={t("aiChat.send")}>
          <span className="material-symbols-outlined" aria-hidden="true">send</span>
        </button>
      </form>
    </section>
  );
}

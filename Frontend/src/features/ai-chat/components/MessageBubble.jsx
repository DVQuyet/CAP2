import RelationshipCard from "./RelationshipCard";

export default function MessageBubble({ message, onCandidatePick }) {
  const isUser = message.role === "user";
  const candidates = message.candidates || message.metadata?.candidates || [];

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
      </div>
    </div>
  );
}

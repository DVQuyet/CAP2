import { useRef, useState } from "react";

export default function VoiceInputButton({ disabled, onTranscript }) {
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef(null);

  const toggleListening = () => {
    if (disabled) return;
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      onTranscript?.("", "Trình duyệt chưa hỗ trợ nhận diện giọng nói.");
      return;
    }

    if (listening && recognitionRef.current) {
      recognitionRef.current.stop();
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "vi-VN";
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.onstart = () => setListening(true);
    recognition.onend = () => setListening(false);
    recognition.onerror = () => {
      setListening(false);
      onTranscript?.("", "Không nghe rõ giọng nói. Vui lòng thử lại.");
    };
    recognition.onresult = (event) => {
      const transcript = event.results?.[0]?.[0]?.transcript || "";
      onTranscript?.(transcript);
    };
    recognitionRef.current = recognition;
    recognition.start();
  };

  return (
    <button
      type="button"
      className={`ai-icon-btn ${listening ? "active" : ""}`}
      onClick={toggleListening}
      disabled={disabled}
      title="Nhập bằng giọng nói"
      aria-label="Nhập bằng giọng nói"
    >
      <span className="material-symbols-outlined">{listening ? "mic" : "mic_none"}</span>
    </button>
  );
}

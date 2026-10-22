import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";

export default function VoiceInputButton({ disabled, onTranscript }) {
  const { t } = useTranslation();
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef(null);

  const toggleListening = () => {
    if (disabled) return;
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      onTranscript?.("", t("aiChat.voiceUnsupported"));
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
      onTranscript?.("", t("aiChat.voiceError"));
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
      title={t("aiChat.voiceInput")}
      aria-label={t("aiChat.voiceInput")}
      aria-pressed={listening}
    >
      <span className="material-symbols-outlined" aria-hidden="true">{listening ? "mic" : "mic_none"}</span>
    </button>
  );
}

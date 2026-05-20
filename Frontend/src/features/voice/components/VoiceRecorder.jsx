import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { getVoiceRecording, uploadVoiceRecording } from "../../../api/voiceService";
import "./VoiceRecorder.css";

const pickMimeType = () => {
  if (!window.MediaRecorder) return "";
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"];
  return candidates.find((type) => window.MediaRecorder.isTypeSupported(type)) || "";
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const VoiceRecorder = ({ disabled = false, maxSeconds = 180, onTranscript }) => {
  const { t } = useTranslation();
  const [state, setState] = useState("idle");
  const [seconds, setSeconds] = useState(0);
  const [message, setMessage] = useState("");
  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const startedAtRef = useRef(0);
  const timerRef = useRef(null);

  useEffect(() => {
    return () => {
      clearInterval(timerRef.current);
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const stopTimer = () => {
    clearInterval(timerRef.current);
    timerRef.current = null;
  };

  const pollTranscript = async (recordingId) => {
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const result = await getVoiceRecording(recordingId);
      const recording = result.recording || {};

      if (recording.status === "completed") {
        const transcript = String(recording.transcript || "").trim();
        onTranscript?.(transcript, recording);
        setMessage(transcript ? t("voice.recorder.receiveSuccess") : t("voice.recorder.receiveEmpty"));
        setState("completed");
        return;
      }

      if (recording.status === "failed") {
        throw new Error(recording.error_message || t("voice.recorder.errors.transcriptionFailed"));
      }

      await wait(2500);
    }

    throw new Error(t("voice.recorder.errors.timeout"));
  };

  const uploadBlob = async (blob) => {
    const durationSeconds = Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000));
    setState("uploading");
    setMessage(t("voice.recorder.uploading"));

    const result = await uploadVoiceRecording(blob, {
      durationSeconds,
      filename: "recording.webm",
    });
    const recordingId = result.recording?.id;
    if (!recordingId) {
      throw new Error(t("voice.recorder.errors.noId"));
    }

    setState("transcribing");
    setMessage(t("voice.recorder.transcribing"));
    await pollTranscript(recordingId);
  };

  const startRecording = async () => {
    try {
      if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
        throw new Error(t("voice.recorder.errors.unsupported"));
      }

      setMessage("");
      setSeconds(0);
      chunksRef.current = [];

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = pickMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);

      recorder.ondataavailable = (event) => {
        if (event.data?.size > 0) chunksRef.current.push(event.data);
      };

      recorder.onstop = () => {
        stopTimer();
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;

        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        if (blob.size <= 0) {
          setState("idle");
          setMessage(t("voice.recorder.noData"));
          return;
        }

        uploadBlob(blob).catch((error) => {
          setState("failed");
          setMessage(error?.message || t("voice.recorder.errors.failed"));
        });
      };

      recorderRef.current = recorder;
      startedAtRef.current = Date.now();
      recorder.start();
      setState("recording");

      timerRef.current = setInterval(() => {
        const elapsed = Math.round((Date.now() - startedAtRef.current) / 1000);
        setSeconds(elapsed);
        if (elapsed >= maxSeconds && recorder.state === "recording") {
          recorder.stop();
        }
      }, 500);
    } catch (error) {
      setState("failed");
      setMessage(error?.message || t("voice.recorder.errors.startFailed"));
    }
  };

  const stopRecording = () => {
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.stop();
    }
  };

  const busy = ["recording", "uploading", "transcribing"].includes(state);
  const icon = state === "recording" ? "stop" : state === "uploading" || state === "transcribing" ? "sync" : "mic";
  const compactLabel = state === "recording" ? `${seconds}s` : state === "transcribing" ? "..." : "";

  return (
    <div className="voice-recorder">
      <button
        type="button"
        className={`voice-recorder-button is-${state}`}
        onClick={state === "recording" ? stopRecording : startRecording}
        disabled={disabled || (busy && state !== "recording")}
        title={state === "recording" ? t("voice.recorder.title.stop") : t("voice.recorder.title.start")}
        aria-label={state === "recording" ? t("voice.recorder.title.stop") : t("voice.recorder.title.start")}
      >
        <span className="material-symbols-outlined">{icon}</span>
        {compactLabel && <span className="voice-recorder-time">{compactLabel}</span>}
      </button>
      {message && <span className={`voice-recorder-status is-${state}`}>{message}</span>}
    </div>
  );
};

export default VoiceRecorder;

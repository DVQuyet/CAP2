import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiRequest } from "../../../services/api";
import { uploadImage } from "../../../api/memberService";
import { mediaUrlFromId } from "../../../shared/utils/media";
import { formatDateTimeVN } from "../../../shared/utils/dateFormat";
import "./TimeCapsulePage.css";

const emptyForm = {
  title: "",
  content: "",
  media_id: null,
  media_url: "",
  media_type: "text",
  mime_type: "",
  original_filename: "",
  visibility: "clan",
  scheduled_publish_at: "",
  readers: [],
};

function getStatusLabel(status, t) {
  if (status === "approved") return t("timeCapsule.status.approved");
  if (status === "rejected") return t("timeCapsule.status.rejected");
  return t("timeCapsule.status.pending");
}

function getMediaKind(fileOrMemory) {
  const mime = String(fileOrMemory?.type || fileOrMemory?.mime_type || "").toLowerCase();
  const explicit = String(fileOrMemory?.media_type || "").toLowerCase();
  if (explicit === "image" || mime.startsWith("image/")) return "image";
  if (explicit === "video" || mime.startsWith("video/")) return "video";
  if (explicit === "audio" || mime.startsWith("audio/")) return "audio";
  return "text";
}

function getVisibilityLabel(visibility, t) {
  if (visibility === "private") return t("timeCapsule.visibility.private");
  if (visibility === "selected") return t("timeCapsule.visibility.selected");
  return t("timeCapsule.visibility.clan");
}

function getReaderKey(reader) {
  return `${reader.account_id || ""}:${reader.person_id || ""}`;
}

function MemoryMedia({ memory, t, showCarouselControls = false, onPrevious, onNext }) {
  // Ưu tiên media_id để tạo URL đúng từ backend, fallback về media_url nếu không có id
  const url = mediaUrlFromId(memory.media_id) || memory.media_url || "";
  if (!url) return null;
  const kind = getMediaKind(memory);
  const mediaAlt = memory.title || t("timeCapsule.defaultMemoryTitle");

  if (kind === "image" || kind === "video") {
    return (
      <div className="memory-media-frame">
        {kind === "image" ? (
          <img className="memory-media" src={url} alt={mediaAlt} />
        ) : (
          <video className="memory-media" src={url} controls preload="metadata" />
        )}
        {showCarouselControls ? (
          <>
            <button type="button" className="memory-carousel-arrow is-left" onClick={onPrevious} aria-label="Xem mục trước">
              <span className="material-symbols-outlined">chevron_left</span>
            </button>
            <button type="button" className="memory-carousel-arrow is-right" onClick={onNext} aria-label="Xem mục tiếp theo">
              <span className="material-symbols-outlined">chevron_right</span>
            </button>
          </>
        ) : null}
      </div>
    );
  }

  if (kind === "audio") return <audio className="memory-audio" src={url} controls />;
  return (
    <a className="memory-file-link" href={url} target="_blank" rel="noreferrer">
      <span className="material-symbols-outlined">attach_file</span>
      {memory.original_filename || t("timeCapsule.openAttachment")}
    </a>
  );
}

function MemoryCard({ memory, isManagerView = false, t, showCarouselControls = false, onPrevious, onNext }) {
  return (
    <article className={`memory-card is-${memory.status || "approved"}`}>
      <div className="memory-card-head">
        <div className="memory-author-avatar">
          {(memory.author_name || "K").slice(0, 1).toUpperCase()}
        </div>
        <div>
          <h3>{memory.title || t("timeCapsule.defaultMemoryTitle")}</h3>
          <p>
            {memory.author_name || t("timeCapsule.defaultAuthor")} • {memory.created_at ? formatDateTimeVN(memory.created_at) : t("timeCapsule.notUpdated")}
          </p>
        </div>
        <span className={`memory-status is-${memory.status || "approved"}`}>{getStatusLabel(memory.status, t)}</span>
      </div>
      {memory.content && <p className="memory-content">{memory.content}</p>}
      <MemoryMedia memory={memory} t={t} showCarouselControls={showCarouselControls} onPrevious={onPrevious} onNext={onNext} />
      <div className="memory-access-meta">
        <span className="material-symbols-outlined">visibility</span>
        <span>{getVisibilityLabel(memory.visibility, t)}</span>
        {memory.visibility === "selected" && Number(memory.reader_count || 0) > 0 ? <span>{t("timeCapsule.readerCount", { count: memory.reader_count })}</span> : null}
        {memory.scheduled_publish_at ? <span>{t("timeCapsule.scheduledPost", { date: formatDateTimeVN(memory.scheduled_publish_at) })}</span> : null}
      </div>
      {memory.status === "pending" && !isManagerView && (
        <div className="memory-note">{t("timeCapsule.pendingNotice")}</div>
      )}
      {memory.status === "rejected" && memory.rejection_reason && (
        <div className="memory-note is-rejected">{t("timeCapsule.rejectionReason", { reason: memory.rejection_reason })}</div>
      )}
    </article>
  );
}

export default function TimeCapsulePage({ role = "member" }) {
  const { t } = useTranslation();
  const isManager = role === "manager" || role === "admin";
  const [memories, setMemories] = useState([]);
  const [readerOptions, setReaderOptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [filePreview, setFilePreview] = useState(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [filter, setFilter] = useState("all");
  const [albumCategory, setAlbumCategory] = useState("image");
  const [carouselIndex, setCarouselIndex] = useState(0);
  const [captureMode, setCaptureMode] = useState("none");
  const [cameraStream, setCameraStream] = useState(null);
  const [recorderState, setRecorderState] = useState("idle");
  const [cameraError, setCameraError] = useState("");
  const [pendingVideo, setPendingVideo] = useState(null);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const liveVideoRef = useRef(null);
  const recorderRef = useRef(null);
  const recordedChunksRef = useRef([]);
  const streamRef = useRef(null);
  const recordingTimerRef = useRef(null);

  const visibilityOptions = useMemo(() => ([
    { value: "clan", label: t("timeCapsule.visibility.clan"), icon: "groups" },
    { value: "selected", label: t("timeCapsule.visibility.selected"), icon: "how_to_reg" },
    { value: "private", label: t("timeCapsule.visibility.private"), icon: "lock" },
  ]), [t]);

  const loadMemories = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await apiRequest("/api/member/memories?includeOwnPending=1");
      setMemories(result.memories || []);
    } catch (err) {
      setError(err?.message || t("timeCapsule.errors.loadMemories"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  const loadReaderOptions = useCallback(async () => {
    try {
      const result = await apiRequest("/api/member/memories/reader-options");
      setReaderOptions(result.readers || []);
    } catch (err) {
      setReaderOptions([]);
    }
  }, []);

  useEffect(() => {
    loadMemories();
    loadReaderOptions();
  }, [loadMemories, loadReaderOptions]);

  useEffect(() => {
    if (liveVideoRef.current && cameraStream) {
      liveVideoRef.current.srcObject = cameraStream;
    }
  }, [cameraStream, captureMode]);

  useEffect(() => {
    return () => {
      if (filePreview?.url) URL.revokeObjectURL(filePreview.url);
    };
  }, [filePreview?.url]);

  useEffect(() => {
    return () => {
      if (pendingVideo?.url) URL.revokeObjectURL(pendingVideo.url);
    };
  }, [pendingVideo?.url]);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks?.().forEach((track) => track.stop());
      if (recorderRef.current && recorderRef.current.state !== "inactive") {
        recorderRef.current.stop();
      }
      if (recordingTimerRef.current) window.clearInterval(recordingTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (recorderState !== "recording") {
      if (recordingTimerRef.current) {
        window.clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }
      return;
    }

    const startedAt = Date.now();
    setRecordingSeconds(0);
    recordingTimerRef.current = window.setInterval(() => {
      setRecordingSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 500);

    return () => {
      if (recordingTimerRef.current) {
        window.clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }
    };
  }, [recorderState]);

  const stats = useMemo(() => {
    const approved = memories.filter((item) => item.status === "approved").length;
    const pending = memories.filter((item) => item.status === "pending").length;
    const media = memories.filter((item) => item.media_id || item.media_url).length;
    return { approved, pending, media };
  }, [memories]);

  const albumTabs = useMemo(() => ([
    { value: "image", label: "Ảnh", icon: "photo_library" },
    { value: "video", label: "Video", icon: "video_library" },
    { value: "audio", label: "Ghi âm", icon: "graphic_eq" },
  ]), []);

  const statusFilteredMemories = useMemo(() => {
    if (filter === "all") return memories;
    return memories.filter((item) => item.status === filter);
  }, [filter, memories]);

  const albumCounts = useMemo(() => statusFilteredMemories.reduce((acc, item) => {
    const kind = getMediaKind(item);
    if (kind === "image" || kind === "video" || kind === "audio") acc[kind] += 1;
    return acc;
  }, { image: 0, video: 0, audio: 0 }), [statusFilteredMemories]);

  const visibleMemories = useMemo(() => (
    statusFilteredMemories.filter((item) => getMediaKind(item) === albumCategory)
  ), [albumCategory, statusFilteredMemories]);

  useEffect(() => {
    setCarouselIndex(0);
  }, [albumCategory, filter]);

  useEffect(() => {
    if (carouselIndex >= visibleMemories.length) setCarouselIndex(0);
  }, [carouselIndex, visibleMemories.length]);

  const showCarousel = albumCategory === "image" || albumCategory === "video";
  const currentCarouselMemory = showCarousel && visibleMemories.length ? visibleMemories[carouselIndex] : null;
  const goToPreviousMemory = () => setCarouselIndex((index) => (visibleMemories.length ? (index - 1 + visibleMemories.length) % visibleMemories.length : 0));
  const goToNextMemory = () => setCarouselIndex((index) => (visibleMemories.length ? (index + 1) % visibleMemories.length : 0));
  const showLiveCapture = (captureMode === "photo" || captureMode === "video") && (cameraStream || pendingVideo);

  const updateField = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setError("");
    setMessage("");
  };

  const formatRecordingTime = (seconds) => {
    const safeSeconds = Math.max(0, Number(seconds) || 0);
    const minutes = Math.floor(safeSeconds / 60);
    const remainingSeconds = safeSeconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
  };

  const toggleReader = (reader) => {
    const key = getReaderKey(reader);
    setForm((prev) => {
      const existing = new Set((prev.readers || []).map(getReaderKey));
      const nextReaders = existing.has(key)
        ? (prev.readers || []).filter((item) => getReaderKey(item) !== key)
        : [
            ...(prev.readers || []),
            {
              account_id: reader.account_id || null,
              person_id: reader.person_id || null,
            },
          ];
      return { ...prev, readers: nextReaders };
    });
    setError("");
    setMessage("");
  };

  const uploadMemoryBlob = async (blob, filename) => {
    if (!blob) return false;
    setUploading(true);
    setError("");
    setMessage("");
    try {
      // Dùng cùng pattern với upload ảnh profile: field "image", endpoint /api/upload
      const file = blob instanceof File ? blob : new File([blob], filename, { type: blob.type || "application/octet-stream" });
      const result = await uploadImage(file, { usageType: "other" });

      // result.imageUrl đã là URL đầy đủ từ backend (https://cap2-backend.onrender.com/api/media/ID)
      const mediaId = result.mediaId || result.media_id || null;
      const fullUrl = result.imageUrl || result.url || (mediaId ? mediaUrlFromId(mediaId) : "");

      if (filePreview?.url) URL.revokeObjectURL(filePreview.url);
      const previewUrl = URL.createObjectURL(file);
      setFilePreview({ url: previewUrl, kind: getMediaKind(file), name: file.name });
      setForm((prev) => ({
        ...prev,
        media_id: mediaId,
        media_url: fullUrl,
        media_type: getMediaKind(file),
        mime_type: file.type,
        original_filename: file.name,
      }));
      setMessage(t("timeCapsule.messages.uploaded"));
      return true;
    } catch (err) {
      setError(err?.message || t("timeCapsule.errors.uploadMemory"));
      return false;
    } finally {
      setUploading(false);
    }
  };

  const handleFileChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    await uploadMemoryBlob(file, file.name);
    event.target.value = "";
  };

  const stopCameraStream = () => {
    if (cameraStream) cameraStream.getTracks().forEach((track) => track.stop());
    streamRef.current?.getTracks?.().forEach((track) => track.stop());
    streamRef.current = null;
    if (pendingVideo?.url) URL.revokeObjectURL(pendingVideo.url);
    setPendingVideo(null);
    setCameraStream(null);
    setCaptureMode("none");
    setRecorderState("idle");
    setRecordingSeconds(0);
    setCameraError("");
  };

  const openCamera = async (mode) => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError(t("timeCapsule.errors.cameraUnsupported"));
      return;
    }
    try {
      if (cameraStream) cameraStream.getTracks().forEach((track) => track.stop());
      if (pendingVideo?.url) URL.revokeObjectURL(pendingVideo.url);
      setPendingVideo(null);
      setCameraError("");

      // Thử environment (camera sau) trước, fallback về user (camera trước) nếu không có
      let stream = null;
      if (mode === "photo") {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
        } catch {
          stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        }
      } else {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: true });
        } catch {
          stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        }
      }

      streamRef.current = stream;
      setCameraStream(stream);
      setCaptureMode(mode);
      setRecorderState("idle");
      setRecordingSeconds(0);
    } catch (err) {
      setCameraError(t("timeCapsule.errors.cameraOpen"));
    }
  };

  const capturePhoto = async () => {
    const video = liveVideoRef.current;
    if (!video) return;
    const width = video.videoWidth || 1280;
    const height = video.videoHeight || 720;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    context.drawImage(video, 0, 0, width, height);
    canvas.toBlob(async (blob) => {
      if (!blob) {
        setError(t("timeCapsule.errors.capturePhoto"));
        return;
      }
      const saved = await uploadMemoryBlob(blob, `ky-niem-${Date.now()}.jpg`);
      if (saved) stopCameraStream();
    }, "image/jpeg", 0.92);
  };

  const pickRecorderMimeType = (mode) => {
    const candidates = mode === "audio"
      ? ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"]
      : ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm", "video/mp4"];
    return candidates.find((type) => window.MediaRecorder?.isTypeSupported?.(type)) || "";
  };

  const startRecordingWithStream = (stream, mode) => {
    if (!window.MediaRecorder) {
      setCameraError(t("timeCapsule.errors.mediaRecorderUnsupported"));
      return;
    }
    recordedChunksRef.current = [];
    const mimeType = pickRecorderMimeType(mode);
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    recorderRef.current = recorder;
    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) recordedChunksRef.current.push(event.data);
    };
    recorder.onerror = () => {
      setCameraError(t("timeCapsule.errors.recordingData"));
      stream.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setCameraStream(null);
      setCaptureMode("none");
      setRecorderState("idle");
    };
    recorder.onstop = async () => {
      try {
        const blobType = recorder.mimeType || (mode === "audio" ? "audio/webm" : "video/webm");
        const blob = new Blob(recordedChunksRef.current, { type: blobType });
        if (!blob.size) {
          setCameraError(t("timeCapsule.errors.emptyRecording"));
          if (mode === "video") {
            setCaptureMode("none");
            setRecorderState("idle");
          }
          return;
        }
        const extension = blobType.includes("mp4") ? (mode === "audio" ? "m4a" : "mp4") : "webm";
        if (mode === "video") {
          const filename = `ky-niem-video-${Date.now()}.${extension}`;
          if (pendingVideo?.url) URL.revokeObjectURL(pendingVideo.url);
          setPendingVideo({ blob, url: URL.createObjectURL(blob), filename });
          setRecorderState("recorded");
          return;
        }
        await uploadMemoryBlob(blob, `ky-niem-${mode === "audio" ? "ghi-am" : "video"}-${Date.now()}.${extension}`);
      } catch (err) {
        setError(err?.message || t("timeCapsule.errors.saveRecording"));
      } finally {
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        if (mode !== "video") {
          // Video mode: giữ captureMode để hiển thị preview, chỉ clear stream thật
          setCameraStream(null);
          setCaptureMode("none");
          setRecorderState("idle");
        } else {
          // Video mode: stream đã stop nhưng giữ captureMode + pendingVideo để user xem preview
          setCameraStream(null);
        }
      }
    };
    recorder.start(1000); // fire ondataavailable mỗi 1 giây, tránh mất data
    setRecorderState("recording");
  };

  const startVideoRecording = () => {
    if (!cameraStream) return;
    startRecordingWithStream(cameraStream, "video");
  };

  const startAudioRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError(t("timeCapsule.errors.audioUnsupported"));
      return;
    }
    try {
      if (cameraStream) cameraStream.getTracks().forEach((track) => track.stop());
      setCameraError("");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      setCameraStream(stream);
      setCaptureMode("audio");
      startRecordingWithStream(stream, "audio");
    } catch (err) {
      setCameraError(t("timeCapsule.errors.microphoneOpen"));
    }
  };

  const stopRecording = () => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
      setRecorderState("stopping");
    }
  };

  const savePendingVideo = async () => {
    if (!pendingVideo?.blob) return;
    const saved = await uploadMemoryBlob(pendingVideo.blob, pendingVideo.filename);
    if (saved) stopCameraStream();
  };

  const removeAttachedMedia = () => {
    if (filePreview?.url) URL.revokeObjectURL(filePreview.url);
    setFilePreview(null);
    setForm((prev) => ({
      ...prev,
      media_id: null,
      media_url: "",
      media_type: "text",
      mime_type: "",
      original_filename: "",
    }));
    setMessage("");
    setError("");
  };

  const resetForm = () => {
    setForm(emptyForm);
    removeAttachedMedia();
    stopCameraStream();
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const hasText = form.title.trim() || form.content.trim();
    if (!hasText && !form.media_id && !form.media_url) {
      setError(t("timeCapsule.errors.emptySubmit"));
      return;
    }
    if (form.visibility === "selected" && !(form.readers || []).length) {
      setError(t("timeCapsule.errors.selectReader"));
      return;
    }
    setSubmitting(true);
    setError("");
    setMessage("");
    try {
      const result = await apiRequest("/api/member/memories", {
        method: "POST",
        body: JSON.stringify(form),
      });
      setMessage(result.message || t("timeCapsule.messages.submitted"));
      resetForm();
      await loadMemories();
    } catch (err) {
      setError(err?.message || t("timeCapsule.errors.submitMemory"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="time-capsule-page memory-page" data-no-translate="true">
      <section className="time-capsule-header memory-hero">
        <div>
          <span className="time-capsule-kicker">{t("timeCapsule.title")}</span>
          <h2>{t("timeCapsule.title")}</h2>
          <p>
            {t("timeCapsule.heroDescription")}
          </p>
        </div>
        <button type="button" className="time-capsule-refresh" onClick={loadMemories} disabled={loading}>
          <span className="material-symbols-outlined">refresh</span>
          {t("common.reload")}
        </button>
      </section>

      {(error || message) && <div className={`time-capsule-alert ${error ? "is-error" : "is-success"}`}>{error || message}</div>}

      <section className="memory-workbench">
        <form className="memory-form" onSubmit={handleSubmit}>
          <div className="memory-form-head">
            <div>
              <h3>{t("timeCapsule.postMemory.title")}</h3>
              <p>{isManager ? t("timeCapsule.postMemory.managerNotice") : t("timeCapsule.postMemory.memberNotice")}</p>
            </div>
            <span className="memory-form-badge">{t("timeCapsule.postMemory.mediaBadge")}</span>
          </div>

          <label className="memory-field">
            <span>{t("common.title")}</span>
            <input value={form.title} onChange={(event) => updateField("title", event.target.value)} placeholder={t("timeCapsule.postMemory.titlePlaceholder")} />
          </label>

          <label className="memory-field">
            <span>{t("common.content")}</span>
            <textarea rows={5} value={form.content} onChange={(event) => updateField("content", event.target.value)} placeholder={t("timeCapsule.postMemory.contentPlaceholder")} />
          </label>

          <section className="memory-access-panel">
            <div className="memory-access-head">
              <div>
                <strong>{t("timeCapsule.postMemory.accessTitle")}</strong>
                <span>{t("timeCapsule.postMemory.accessDescription")}</span>
              </div>
            </div>

            <div className="memory-visibility-options" role="radiogroup" aria-label={t("timeCapsule.postMemory.accessTitle")}>
              {visibilityOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={form.visibility === option.value ? "active" : ""}
                  onClick={() => updateField("visibility", option.value)}
                  aria-pressed={form.visibility === option.value}
                >
                  <span className="material-symbols-outlined">{option.icon}</span>
                  {option.label}
                </button>
              ))}
            </div>

            {form.visibility === "selected" ? (
              <div className="memory-reader-picker">
                {readerOptions.length ? (
                  readerOptions.map((reader) => {
                    const selected = (form.readers || []).some((item) => getReaderKey(item) === getReaderKey(reader));
                    return (
                      <label className={selected ? "memory-reader-option is-selected" : "memory-reader-option"} key={getReaderKey(reader)}>
                        <input type="checkbox" checked={selected} onChange={() => toggleReader(reader)} />
                        <span>
                          <strong>{reader.display_name || reader.email || t("timeCapsule.defaultAuthor")}</strong>
                          <small>{reader.email || `Person #${reader.person_id}`}</small>
                        </span>
                      </label>
                    );
                  })
                ) : (
                  <div className="memory-reader-empty">{t("timeCapsule.postMemory.readerEmpty")}</div>
                )}
              </div>
            ) : null}

            <label className="memory-schedule-field">
              <span>{t("timeCapsule.postMemory.scheduleLabel")}</span>
              <input
                type="datetime-local"
                value={form.scheduled_publish_at}
                onChange={(event) => updateField("scheduled_publish_at", event.target.value)}
              />
              <small>{t("timeCapsule.postMemory.scheduleHelp")}</small>
            </label>
          </section>

          <div className="memory-capture-tools">
            <label className="memory-upload-box">
              <input type="file" accept="image/*,video/*,audio/*" onChange={handleFileChange} disabled={uploading || submitting} />
              <span className="material-symbols-outlined">upload_file</span>
              <strong>{uploading ? t("common.uploading") : t("timeCapsule.postMemory.uploadFile")}</strong>
              <small>{t("timeCapsule.postMemory.uploadHelp")}</small>
            </label>

            <button type="button" className="memory-capture-button" onClick={() => openCamera("photo")} disabled={uploading || submitting || recorderState === "recording"}>
              <span className="material-symbols-outlined">photo_camera</span>
              <strong>{t("timeCapsule.postMemory.takePhoto")}</strong>
              <small>{t("timeCapsule.postMemory.takePhotoHelp")}</small>
            </button>

            <button type="button" className="memory-capture-button" onClick={() => openCamera("video")} disabled={uploading || submitting || recorderState === "recording"}>
              <span className="material-symbols-outlined">videocam</span>
              <strong>{t("timeCapsule.postMemory.recordVideo")}</strong>
              <small>{t("timeCapsule.postMemory.recordVideoHelp")}</small>
            </button>

            <button type="button" className={`memory-capture-button ${recorderState === "recording" && captureMode === "audio" ? "is-recording" : ""}`} onClick={recorderState === "recording" && captureMode === "audio" ? stopRecording : startAudioRecording} disabled={uploading || submitting || recorderState === "stopping" || (recorderState === "recording" && captureMode !== "audio")}>
              <span className="material-symbols-outlined">mic</span>
              <strong>{recorderState === "recording" && captureMode === "audio" ? t("timeCapsule.postMemory.stopAudio") : t("timeCapsule.postMemory.recordAudio")}</strong>
              <small>{t("timeCapsule.postMemory.recordAudioHelp")}</small>
            </button>
          </div>

          {showLiveCapture ? (
            <div className={`memory-live-capture is-${captureMode}`}>
              <div className="memory-live-topbar">
                <span className="memory-live-mode">
                  <span className="material-symbols-outlined">{captureMode === "photo" ? "photo_camera" : "videocam"}</span>
                  {captureMode === "photo" ? t("timeCapsule.postMemory.takePhoto") : t("timeCapsule.postMemory.recordVideo")}
                </span>
                {captureMode === "video" && recorderState === "recording" ? (
                  <span className="memory-recording-timer">
                    <span className="memory-recording-dot" />
                    {formatRecordingTime(recordingSeconds)}
                  </span>
                ) : null}
              </div>

              {pendingVideo ? (
                <video className="memory-live-video" src={pendingVideo.url} controls playsInline />
              ) : (
                <video className="memory-live-video" ref={liveVideoRef} autoPlay muted playsInline />
              )}

              <div className="memory-live-actions">
                {captureMode === "photo" ? (
                  <button type="button" className="time-capsule-primary memory-shutter-button" onClick={capturePhoto} disabled={uploading || submitting}>
                    <span className="material-symbols-outlined">camera</span>
                    {t("timeCapsule.postMemory.captureThisPhoto")}
                  </button>
                ) : recorderState === "recording" ? (
                  <button type="button" className="time-capsule-danger" onClick={stopRecording}>{t("timeCapsule.postMemory.stopVideo")}</button>
                ) : recorderState === "stopping" ? (
                  <button type="button" className="time-capsule-secondary" disabled>{t("timeCapsule.postMemory.processingVideo")}</button>
                ) : pendingVideo ? (
                  <button type="button" className="time-capsule-primary" onClick={savePendingVideo} disabled={uploading || submitting}>{uploading ? t("common.uploading") : t("timeCapsule.postMemory.saveVideo")}</button>
                ) : (
                  <button type="button" className="time-capsule-primary" onClick={startVideoRecording} disabled={uploading || submitting}>{t("timeCapsule.postMemory.startRecording")}</button>
                )}
                <button type="button" className="time-capsule-secondary" onClick={stopCameraStream} disabled={uploading || recorderState === "stopping" || recorderState === "recording"}>{t("common.closeCamera")}</button>
              </div>
            </div>
          ) : null}

          {captureMode === "audio" && recorderState === "recording" ? (
            <div className="memory-recording-strip">
              <span className="memory-recording-dot" />
              {t("timeCapsule.postMemory.recordingAudio")}
            </div>
          ) : null}

          {cameraError ? <div className="memory-camera-error">{cameraError}</div> : null}

          {filePreview && (
            <div className="memory-preview">
              {filePreview.kind === "image" && <img src={filePreview.url} alt={t("timeCapsule.postMemory.previewAlt")} />}
              {filePreview.kind === "video" && <video src={filePreview.url} controls />}
              {filePreview.kind === "audio" && <audio src={filePreview.url} controls />}
              <div className="memory-preview-footer">
                <span>{filePreview.name}</span>
                <button type="button" onClick={removeAttachedMedia} disabled={submitting || uploading}>{t("common.deleteFile")}</button>
              </div>
            </div>
          )}

          <div className="memory-actions">
            <button type="button" className="time-capsule-secondary" onClick={resetForm} disabled={submitting || uploading}>{t("timeCapsule.postMemory.clearForm")}</button>
            <button type="submit" className="time-capsule-primary" disabled={submitting || uploading}>{submitting ? t("common.submitting") : t("timeCapsule.postMemory.submit")}</button>
          </div>
        </form>

        <aside className="memory-stats-panel">
          <div><strong>{stats.approved}</strong><span>{t("timeCapsule.stats.approved")}</span></div>
          <div><strong>{stats.pending}</strong><span>{t("timeCapsule.stats.pending")}</span></div>
          <div><strong>{stats.media}</strong><span>{t("timeCapsule.stats.media")}</span></div>
        </aside>
      </section>

      <section className="time-capsule-list memory-list-section">
        <div className="time-capsule-list-head">
          <div>
            <h3>{t("timeCapsule.list.title")}</h3>
            <span>{t("timeCapsule.list.description")}</span>
          </div>
          <div className="memory-filter-panel">
            <div className="memory-album-tabs" aria-label="Danh mục album kỉ niệm">
              {albumTabs.map((tab) => (
                <button
                  key={tab.value}
                  type="button"
                  className={albumCategory === tab.value ? "active" : ""}
                  onClick={() => setAlbumCategory(tab.value)}
                >
                  <span className="material-symbols-outlined">{tab.icon}</span>
                  <strong>{tab.label}</strong>
                  <small>{albumCounts[tab.value] || 0}</small>
                </button>
              ))}
            </div>
            <div className="memory-filter-group">
              <button className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>{t("common.all")}</button>
              <button className={filter === "approved" ? "active" : ""} onClick={() => setFilter("approved")}>{t("common.approved")}</button>
              <button className={filter === "pending" ? "active" : ""} onClick={() => setFilter("pending")}>{t("common.pending")}</button>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="time-capsule-empty">{t("timeCapsule.list.loading")}</div>
        ) : visibleMemories.length === 0 ? (
          <div className="time-capsule-empty">Chưa có nội dung trong danh mục {albumTabs.find((tab) => tab.value === albumCategory)?.label || "này"}.</div>
        ) : showCarousel && currentCarouselMemory ? (
          <div className="memory-carousel-stage">
            <MemoryCard
              key={currentCarouselMemory.id}
              memory={currentCarouselMemory}
              t={t}
              showCarouselControls={visibleMemories.length > 1}
              onPrevious={goToPreviousMemory}
              onNext={goToNextMemory}
            />
            <div className="memory-carousel-counter">
              {carouselIndex + 1} / {visibleMemories.length}
            </div>
          </div>
        ) : (
          <div className="memory-feed">
            {visibleMemories.map((memory) => <MemoryCard key={memory.id} memory={memory} t={t} />)}
          </div>
        )}
      </section>
    </div>
  );
}

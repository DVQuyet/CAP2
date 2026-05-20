import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { uploadImage } from "../../api/memberService";
import "./ImageUpload.css";

const AVATAR_OUTPUT_SIZE = 512;
const CROP_VIEWPORT_SIZE = 280;
const CROP_CIRCLE_INSET = 18;
const CROP_AREA_SIZE = CROP_VIEWPORT_SIZE - CROP_CIRCLE_INSET * 2;

const ImageUpload = ({
  onUploadSuccess,
  label,
  value = "",
  disabled = false,
  usageType = "other",
  crop = undefined,
  accept = "image/*",
  allowVideo = false,
}) => {
  const { t } = useTranslation();
  const uploadLabel = label || t("shared.upload.label");
  const avatarMode = useMemo(() => {
    if (typeof crop === "boolean") return crop;
    return String(usageType || "").toLowerCase().includes("avatar");
  }, [crop, usageType]);

  const [isDragging, setIsDragging] = useState(false);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [urlInput, setUrlInput] = useState("");
  const [cropFile, setCropFile] = useState(null);
  const [cropSource, setCropSource] = useState("");
  const [cropImageSize, setCropImageSize] = useState({ width: 0, height: 0 });
  const [cropScale, setCropScale] = useState(1);
  const [cropOffset, setCropOffset] = useState({ x: 0, y: 0 });
  const [isCropping, setIsCropping] = useState(false);
  const fileInputRef = useRef(null);
  const cropImageRef = useRef(null);
  const dragRef = useRef(null);

  const isVideoPreview = useMemo(() => {
    const value = String(preview || "").toLowerCase();
    return /[?&]media=video\b/.test(value) || /\.(mp4|webm|mov|m4v)(\?|#|$)/.test(value);
  }, [preview]);

  const cropBaseScale = useMemo(() => {
    if (!cropImageSize.width || !cropImageSize.height) return 1;
    return Math.min(CROP_VIEWPORT_SIZE / cropImageSize.width, CROP_VIEWPORT_SIZE / cropImageSize.height);
  }, [cropImageSize]);

  const cropDisplayWidth = cropImageSize.width ? cropImageSize.width * cropBaseScale * cropScale : CROP_VIEWPORT_SIZE;
  const cropDisplayHeight = cropImageSize.height ? cropImageSize.height * cropBaseScale * cropScale : CROP_VIEWPORT_SIZE;

  useEffect(() => {
    const nextValue = String(value || "").trim();
    setUrlInput(nextValue);
    setPreview(nextValue || null);
  }, [value]);

  useEffect(() => {
    return () => {
      if (cropSource) URL.revokeObjectURL(cropSource);
    };
  }, [cropSource]);

  const uploadSelectedFile = async (file, localPreviewUrl) => {
    setLoading(true);
    setError("");
    setPreview(localPreviewUrl);
    setUrlInput("");

    try {
      const result = await uploadImage(file, { usageType });
      if (result.success) {
        const uploadedUrl = result.url || result.imageUrl || "";
        const previewUrl = file.type?.startsWith("video/") && uploadedUrl && !/[?&]media=video\b/.test(uploadedUrl)
          ? `${uploadedUrl}${uploadedUrl.includes("?") ? "&" : "?"}media=video`
          : uploadedUrl;
        onUploadSuccess?.(previewUrl, { ...result, mimeType: result.mimeType || result.mime_type || file.type });
      } else {
        setError(result.message || t("shared.upload.failed"));
      }
    } catch (err) {
      setError(err.message || t("shared.upload.error"));
    } finally {
      setLoading(false);
    }
  };

  const resetCropState = () => {
    if (cropSource) URL.revokeObjectURL(cropSource);
    setCropFile(null);
    setCropSource("");
    setCropImageSize({ width: 0, height: 0 });
    setCropScale(1);
    setCropOffset({ x: 0, y: 0 });
    setIsCropping(false);
    dragRef.current = null;
  };

  const handleFile = async (file) => {
    if (!file || disabled) return;
    const isImage = file.type.startsWith("image/");
    const isVideo = file.type.startsWith("video/");
    if (!isImage && !(allowVideo && isVideo)) {
      setError(allowVideo ? t("shared.upload.invalidImageVideo") : t("shared.upload.invalidImage"));
      return;
    }

    if (avatarMode && !isImage) {
      setError(t("shared.upload.avatarOnlyImage"));
      return;
    }

    setError("");
    if (avatarMode) {
      if (cropSource) URL.revokeObjectURL(cropSource);
      const source = URL.createObjectURL(file);
      setCropFile(file);
      setCropSource(source);
      setCropImageSize({ width: 0, height: 0 });
      setCropScale(1);
      setCropOffset({ x: 0, y: 0 });
      setIsCropping(false);
      return;
    }

    const localUrl = URL.createObjectURL(file);
    await uploadSelectedFile(file, localUrl);
  };

  const handleUrlChange = (event) => {
    const nextValue = event.target.value;
    setUrlInput(nextValue);
    if (nextValue.trim()) {
      setPreview(nextValue.trim());
      onUploadSuccess?.(nextValue.trim(), { imageUrl: nextValue.trim(), url: nextValue.trim(), mediaId: null, media_id: null });
    } else {
      setPreview(null);
      onUploadSuccess?.("", { imageUrl: "", url: "", mediaId: null, media_id: null });
    }
  };

  const clearImage = (event) => {
    event.stopPropagation();
    setPreview(null);
    setUrlInput("");
    setError("");
    if (fileInputRef.current) fileInputRef.current.value = "";
    onUploadSuccess?.("", { imageUrl: "", url: "", mediaId: null, media_id: null });
  };

  const handleCropPointerDown = (event) => {
    event.preventDefault();
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      offsetX: cropOffset.x,
      offsetY: cropOffset.y,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handleCropPointerMove = (event) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setCropOffset({
      x: drag.offsetX + event.clientX - drag.startX,
      y: drag.offsetY + event.clientY - drag.startY,
    });
  };

  const handleCropPointerUp = (event) => {
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null;
    }
  };

  const buildCroppedFile = async () => {
    const image = cropImageRef.current;
    if (!image || !cropFile || !cropImageSize.width || !cropImageSize.height) return null;

    const canvas = document.createElement("canvas");
    canvas.width = AVATAR_OUTPUT_SIZE;
    canvas.height = AVATAR_OUTPUT_SIZE;
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    const viewport = CROP_VIEWPORT_SIZE;
    const outputScale = AVATAR_OUTPUT_SIZE / CROP_AREA_SIZE;
    const baseScale = Math.min(viewport / cropImageSize.width, viewport / cropImageSize.height);
    const drawScale = baseScale * cropScale;
    const drawWidth = cropImageSize.width * drawScale;
    const drawHeight = cropImageSize.height * drawScale;
    const drawX = (viewport - drawWidth) / 2 + cropOffset.x;
    const drawY = (viewport - drawHeight) / 2 + cropOffset.y;

    // The visible avatar is the inner circular guide, not the whole square stage.
    // Crop exactly the same inner area so the saved avatar matches what the user saw.
    const cropLeft = CROP_CIRCLE_INSET;
    const cropTop = CROP_CIRCLE_INSET;

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, AVATAR_OUTPUT_SIZE, AVATAR_OUTPUT_SIZE);
    ctx.drawImage(
      image,
      (drawX - cropLeft) * outputScale,
      (drawY - cropTop) * outputScale,
      drawWidth * outputScale,
      drawHeight * outputScale
    );

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
    if (!blob) return null;

    const baseName = cropFile.name?.replace(/\.[^.]+$/, "") || "avatar";
    return new File([blob], `${baseName}-avatar.jpg`, { type: "image/jpeg" });
  };

  const confirmCrop = async () => {
    if (disabled || loading || isCropping) return;
    setIsCropping(true);
    setError("");

    try {
      const croppedFile = await buildCroppedFile();
      if (!croppedFile) {
        setError(t("shared.upload.cropFailed"));
        setIsCropping(false);
        return;
      }
      const localPreviewUrl = URL.createObjectURL(croppedFile);
      resetCropState();
      await uploadSelectedFile(croppedFile, localPreviewUrl);
    } catch (err) {
      setError(err.message || t("shared.upload.cropError"));
      setIsCropping(false);
    }
  };

  return (
    <div className={`image-upload-container ${avatarMode ? "is-avatar-upload" : ""}`} data-no-translate="true">
      <div className="upload-options">
        <div
          className={`upload-dropzone ${isDragging ? "dragging" : ""} ${preview ? "has-preview" : ""}`}
          onDragOver={(event) => {
            event.preventDefault();
            if (!disabled) setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setIsDragging(false);
            handleFile(event.dataTransfer.files[0]);
          }}
          onClick={() => !disabled && fileInputRef.current?.click()}
        >
          <input
            type="file"
            hidden
            ref={fileInputRef}
            onChange={(event) => handleFile(event.target.files[0])}
            accept={accept}
            disabled={disabled || loading}
          />

          {preview ? (
            <div className="preview-container">
              {isVideoPreview ? (
                <video src={preview} className="image-preview" controls muted playsInline preload="metadata" />
              ) : (
                <img src={preview} alt="" className="image-preview" onError={() => setError(t("shared.upload.invalidUrl"))} />
              )}
              <div className="preview-overlay">
                <span>{avatarMode ? t("shared.upload.changeAvatar") : allowVideo ? t("shared.upload.changeImageVideo") : t("shared.upload.changeImage")}</span>
              </div>
              <button className="preview-clear" type="button" onClick={clearImage} disabled={disabled || loading}>
                {t("common.deleteFile")}
              </button>
            </div>
          ) : (
            <div className="upload-placeholder">
              <div className="upload-icon">
                <svg viewBox="0 0 24 24" width="32" height="32" fill="currentColor" aria-hidden="true">
                  <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM14 13v4h-4v-4H7l5-5 5 5h-3z" />
                </svg>
              </div>
              <p>{uploadLabel}</p>
              <span className="upload-hint">{t("shared.upload.dragHint")}</span>
            </div>
          )}

          {loading && <div className="upload-loader">{t("common.loading")}</div>}
        </div>

        <div className="url-input-wrapper">
          <span className="url-sep">{t("shared.upload.orPasteUrl")}</span>
          <input
            type="text"
            className="url-field"
            placeholder="https://example.com/image.jpg"
            value={urlInput}
            onChange={handleUrlChange}
            disabled={disabled || loading}
          />
        </div>
      </div>
      {error && <p className="upload-error">{error}</p>}

      {cropSource ? (
        <div className="avatar-crop-backdrop" role="dialog" aria-modal="true" aria-label={t("shared.upload.cropAvatar")}>
          <div className="avatar-crop-modal">
            <div className="avatar-crop-header">
              <div>
                <strong>{t("shared.upload.cropAvatar")}</strong>
                <span>{t("shared.upload.cropHelp")}</span>
              </div>
              <button type="button" className="avatar-crop-close" onClick={resetCropState} disabled={loading || isCropping}>
                ×
              </button>
            </div>

            <div
              className="avatar-crop-stage"
              onPointerDown={handleCropPointerDown}
              onPointerMove={handleCropPointerMove}
              onPointerUp={handleCropPointerUp}
              onPointerCancel={handleCropPointerUp}
            >
              <img
                ref={cropImageRef}
                src={cropSource}
                alt=""
                draggable="false"
                className="avatar-crop-image"
                style={{
                  width: `${cropDisplayWidth}px`,
                  height: `${cropDisplayHeight}px`,
                  transform: `translate(calc(-50% + ${cropOffset.x}px), calc(-50% + ${cropOffset.y}px))`,
                }}
                onLoad={(event) => {
                  setCropImageSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight });
                }}
              />
              <div className="avatar-crop-mask" aria-hidden="true" />
              <div className="avatar-crop-circle" aria-hidden="true" />
            </div>

            <label className="avatar-crop-zoom">
              <span>{t("shared.upload.zoom")}</span>
              <input
                type="range"
                min="1"
                max="6"
                step="0.01"
                value={cropScale}
                onChange={(event) => setCropScale(Number(event.target.value))}
              />
            </label>

            <div className="avatar-crop-actions">
              <button type="button" className="avatar-crop-cancel" onClick={resetCropState} disabled={loading || isCropping}>
                {t("common.cancel")}
              </button>
              <button type="button" className="avatar-crop-confirm" onClick={confirmCrop} disabled={loading || isCropping}>
                {isCropping || loading ? t("shared.upload.saving") : t("shared.upload.cropAndUpload")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default ImageUpload;

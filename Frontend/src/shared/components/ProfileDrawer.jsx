import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiRequest } from "../../services/api";
import { getStoredUser } from "../utils/auth";
import "./ProfileDrawer.css";

const buildName = (profile) =>
  profile?.display_name ||
  [profile?.surname, profile?.middle_name, profile?.first_name].filter(Boolean).join(" ").trim() ||
  profile?.email ||
  "";

function syncStoredUser(profile, setCurrentUser) {
  if (!profile) return;

  const storedUser = getStoredUser() || {};
  const profileName = buildName(profile);

  const nextUser = {
    ...storedUser,
    email: profile.email || storedUser.email,
    display_name: profile.display_name || storedUser.display_name,
    name: profileName || storedUser.name,
    role_id: profile.role_id || storedUser.role_id,
    status: profile.status || storedUser.status,
    avatar_url: profile.avatar_url || storedUser.avatar_url || "",
  };

  localStorage.setItem("auth_user", JSON.stringify(nextUser));
  localStorage.setItem("user", JSON.stringify(nextUser));

  if (typeof setCurrentUser === "function") {
    setCurrentUser(nextUser);
  }
}

export default function ProfileDrawer({
  open,
  onClose,
  currentUser,
  setCurrentUser,
  roleLabel,
  title,
}) {
  const { t } = useTranslation();
  const drawerTitle = title || t("common.editProfile");
  const drawerRoleLabel = roleLabel || t("layout.familyMember");
  const [loading, setLoading] = useState(false);
  const [savingBasic, setSavingBasic] = useState(false);
  const [savingContent, setSavingContent] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [message, setMessage] = useState("");

  const [profile, setProfile] = useState({});
  const [avatarFile, setAvatarFile] = useState(null);

  const [basicForm, setBasicForm] = useState({
    display_name: "",
    email: "",
    surname: "",
    middle_name: "",
    first_name: "",
    hometown: "",
    generation: "",
  });

  const [contentForm, setContentForm] = useState({
    avatar_url: "",
    avatar_media_id: null,
    bio: "",
  });

  const [passwordForm, setPasswordForm] = useState({
    current_password: "",
    new_password: "",
    confirm_password: "",
  });

  const [avatarPreview, setAvatarPreview] = useState("");
  const [avatarZoom, setAvatarZoom] = useState(1);
  const [avatarPosition, setAvatarPosition] = useState({ x: 50, y: 50 });
  const [avatarEditorOpen, setAvatarEditorOpen] = useState(false);

  const displayName = useMemo(
    () => buildName(profile) || currentUser?.name || currentUser?.display_name || currentUser?.email || t("shared.profile.account"),
    [profile, currentUser, t],
  );

  const avatarUrl =
    avatarPreview ||
    contentForm.avatar_url ||
    profile.avatar_url ||
    currentUser?.avatar_url ||
    "";

  const handleAvatarFileChange = (event) => {
    const file = event.target.files?.[0];

    if (!file) return;

    if (!file.type.startsWith("image/")) {
      alert(t("shared.upload.invalidImage"));
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      alert(t("shared.profile.maxSize"));
      return;
    }

    if (avatarPreview && avatarPreview.startsWith("blob:")) {
      URL.revokeObjectURL(avatarPreview);
    }

    const previewUrl = URL.createObjectURL(file);

    setAvatarFile(file);
    setAvatarPreview(previewUrl);
    setAvatarZoom(1);
    setAvatarPosition({ x: 50, y: 50 });
    setAvatarEditorOpen(true);

    event.target.value = "";
  };

  const handleAvatarDrag = (event) => {
    const frame = event.currentTarget.getBoundingClientRect();

    const x = ((event.clientX - frame.left) / frame.width) * 100;
    const y = ((event.clientY - frame.top) / frame.height) * 100;

    setAvatarPosition({
      x: Math.max(0, Math.min(100, x)),
      y: Math.max(0, Math.min(100, y)),
    });
  };

  const drawCroppedAvatarToCanvas = () =>
    new Promise((resolve, reject) => {
      if (!avatarPreview) {
        resolve(null);
        return;
      }

      const image = new Image();
      image.crossOrigin = "anonymous";

      image.onload = () => {
        const size = 420;
        const canvas = document.createElement("canvas");

        canvas.width = size;
        canvas.height = size;

        const ctx = canvas.getContext("2d");

        if (!ctx) {
          reject(new Error(t("shared.profile.canvasFailed")));
          return;
        }

        ctx.fillStyle = "#fff8ec";
        ctx.fillRect(0, 0, size, size);

        /*
          Dùng contain thay vì cover để ảnh không bị mất khung.
          Math.min giúp ảnh nằm trọn trong khung tròn.
          Khi kéo thanh thu phóng, avatarZoom mới phóng to ảnh.
        */
        const baseScale = Math.min(size / image.width, size / image.height);
        const scale = baseScale * avatarZoom;

        const drawWidth = image.width * scale;
        const drawHeight = image.height * scale;

        const focusX = avatarPosition.x / 100;
        const focusY = avatarPosition.y / 100;

        /*
          Chỉ cho kéo khi ảnh lớn hơn khung.
          Nếu ảnh nhỏ hơn khung thì tự căn giữa, không bị lệch.
        */
        const maxMoveX = Math.max(0, drawWidth - size);
        const maxMoveY = Math.max(0, drawHeight - size);

        const drawX = (size - drawWidth) / 2 - (focusX - 0.5) * maxMoveX;
        const drawY = (size - drawHeight) / 2 - (focusY - 0.5) * maxMoveY;

        ctx.drawImage(image, drawX, drawY, drawWidth, drawHeight);

        resolve(canvas);
      };

      image.onerror = () => {
        reject(new Error(t("shared.profile.processAvatarFailed")));
      };

      image.src = avatarPreview;
    });

  const createCroppedAvatarDataUrl = async () => {
    const canvas = await drawCroppedAvatarToCanvas();

    if (!canvas) {
      return "";
    }

    return canvas.toDataURL("image/jpeg", 0.9);
  };

  const createCroppedAvatarFile = async () => {
    if (!avatarPreview) {
      return null;
    }

    const canvas = await drawCroppedAvatarToCanvas();

    if (!canvas) {
      return null;
    }

    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error(t("shared.profile.processAvatarFailed")));
            return;
          }

          const baseName = avatarFile?.name?.replace(/\.[^.]+$/, "") || "avatar";

          const croppedFile = new File([blob], `${baseName}-avatar.jpg`, {
            type: "image/jpeg",
          });

          resolve(croppedFile);
        },
        "image/jpeg",
        0.9,
      );
    });
  };

  const handleApplyAvatarEdit = async () => {
    setMessage("");

    try {
      const croppedDataUrl = await createCroppedAvatarDataUrl();

      if (!croppedDataUrl) {
        setMessage(t("shared.profile.noAvatarToApply"));
        return;
      }

      if (avatarPreview && avatarPreview.startsWith("blob:")) {
        URL.revokeObjectURL(avatarPreview);
      }

      setAvatarPreview(croppedDataUrl);
      setAvatarFile(null);

      setContentForm((prev) => ({
        ...prev,
        avatar_url: croppedDataUrl,
        avatar_media_id: null,
      }));

      setAvatarZoom(1);
      setAvatarPosition({ x: 50, y: 50 });
      setAvatarEditorOpen(false);
      setMessage(t("shared.profile.avatarApplied"));
    } catch (error) {
      setMessage(error?.message || t("shared.profile.avatarApplyFailed"));
    }
  };

  const loadProfile = async () => {
    setLoading(true);
    setMessage("");

    try {
      const data = await apiRequest("/api/member/dashboard");
      const nextProfile = data.profile || {};

      setProfile(nextProfile);

      setBasicForm({
        display_name:
          nextProfile.display_name ||
          [nextProfile.surname, nextProfile.middle_name, nextProfile.first_name].filter(Boolean).join(" ").trim() ||
          "",
        email: nextProfile.email || "",
        surname: nextProfile.surname || "",
        middle_name: nextProfile.middle_name || "",
        first_name: nextProfile.first_name || "",
        hometown: nextProfile.hometown || "",
        generation: nextProfile.generation ?? "",
      });

      setContentForm({
        avatar_url:
          nextProfile.pending_avatar_url !== null && nextProfile.pending_avatar_url !== undefined
            ? nextProfile.pending_avatar_url || ""
            : nextProfile.avatar_url || "",
        avatar_media_id:
          nextProfile.pending_avatar_media_id !== null && nextProfile.pending_avatar_media_id !== undefined
            ? nextProfile.pending_avatar_media_id || null
            : nextProfile.avatar_media_id || null,
        bio:
          nextProfile.pending_bio !== null && nextProfile.pending_bio !== undefined
            ? nextProfile.pending_bio || ""
            : nextProfile.bio || "",
      });

      syncStoredUser(nextProfile, setCurrentUser);
    } catch (error) {
      setMessage(error?.message || t("shared.profile.loadFailed"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) loadProfile();
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;

    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose?.();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (open) return undefined;

    if (avatarPreview && avatarPreview.startsWith("blob:")) {
      URL.revokeObjectURL(avatarPreview);
    }

    setAvatarFile(null);
    setAvatarPreview("");
    setAvatarZoom(1);
    setAvatarPosition({ x: 50, y: 50 });
    setAvatarEditorOpen(false);

    return undefined;
  }, [open]);

  if (!open) return null;

  const handleFullNameChange = (event) => {
    const fullNameValue = event.target.value;
    const parts = fullNameValue.trim().split(/\s+/);

    let surname = "";
    let middle_name = "";
    let first_name = "";

    if (parts.length === 1 && parts[0] !== "") {
      first_name = parts[0];
    } else if (parts.length === 2) {
      surname = parts[0];
      first_name = parts[1];
    } else if (parts.length >= 3) {
      surname = parts[0];
      first_name = parts[parts.length - 1];
      middle_name = parts.slice(1, parts.length - 1).join(" ");
    }

    setBasicForm((prev) => ({
      ...prev,
      display_name: fullNameValue,
      surname,
      middle_name,
      first_name,
    }));
  };

  const updateBasicField = (event) => {
    const { name, value } = event.target;
    setBasicForm((prev) => ({ ...prev, [name]: value }));
  };

  const updateContentField = (event) => {
    const { name, value } = event.target;
    setContentForm((prev) => ({ ...prev, [name]: value }));
  };

  const updatePasswordField = (event) => {
    const { name, value } = event.target;
    setPasswordForm((prev) => ({ ...prev, [name]: value }));
  };

  const saveBasicInfo = async () => {
    setMessage("");

    if (profile.person_id == null) {
      setMessage(t("shared.profile.notLinked"));
      return;
    }

    const generationText = String(basicForm.generation || "").trim();
    const generation = generationText === "" ? null : Number(generationText);

    if (generationText && !Number.isFinite(generation)) {
      setMessage(t("shared.profile.invalidGeneration"));
      return;
    }

    setSavingBasic(true);

    try {
      const data = await apiRequest("/api/member/profile", {
        method: "PUT",
        body: JSON.stringify({
          display_name: basicForm.display_name,
          email: basicForm.email,
          surname: basicForm.surname,
          middle_name: basicForm.middle_name,
          first_name: basicForm.first_name,
          hometown: basicForm.hometown,
          generation,
        }),
      });

      syncStoredUser(data.profile, setCurrentUser);
      setProfile((prev) => ({ ...prev, ...(data.profile || {}) }));
      setMessage(t("shared.profile.basicSaved"));

      await loadProfile();
    } catch (error) {
      setMessage(error?.message || t("shared.profile.basicSaveFailed"));
    } finally {
      setSavingBasic(false);
    }
  };

  const submitProfileContent = async () => {
    setMessage("");

    if (profile.person_id == null) {
      setMessage(t("shared.profile.notLinkedContent"));
      return;
    }

    setSavingContent(true);

    try {
      let nextAvatarUrl = contentForm.avatar_url || "";
      let nextAvatarMediaId = contentForm.avatar_media_id || null;

      if (avatarPreview && (avatarFile || avatarPreview.startsWith("data:"))) {
        const croppedFile = await createCroppedAvatarFile();

        if (!croppedFile) {
          setMessage(t("shared.profile.processAvatarFailed"));
          setSavingContent(false);
          return;
        }

        const formData = new FormData();
        formData.append("image", croppedFile);
        formData.append("usage_type", "pending_avatar");

        const uploadResult = await apiRequest("/api/upload", {
          method: "POST",
          body: formData,
        });

        console.log("Kết quả upload ảnh:", uploadResult);

        nextAvatarUrl =
          uploadResult.url ||
          uploadResult.imageUrl ||
          uploadResult.image_url ||
          uploadResult.file_url ||
          uploadResult.path ||
          "";

        nextAvatarMediaId =
          uploadResult.mediaId ||
          uploadResult.media_id ||
          uploadResult.id ||
          null;

        if (!nextAvatarUrl) {
          throw new Error(t("shared.profile.uploadMissingUrl"));
        }
      }

      await apiRequest("/api/member/content/profile", {
        method: "POST",
        body: JSON.stringify({
          avatar_url: nextAvatarUrl,
          avatar_media_id: nextAvatarMediaId,
          bio: contentForm.bio,
        }),
      });

      setContentForm((prev) => ({
        ...prev,
        avatar_url: nextAvatarUrl,
        avatar_media_id: nextAvatarMediaId,
      }));

      setProfile((prev) => ({
        ...prev,
        pending_avatar_url: nextAvatarUrl,
        pending_avatar_media_id: nextAvatarMediaId,
        pending_bio: contentForm.bio,
      }));

      if (avatarPreview && avatarPreview.startsWith("blob:")) {
        URL.revokeObjectURL(avatarPreview);
      }

      setAvatarFile(null);
      setAvatarPreview("");
      setAvatarZoom(1);
      setAvatarPosition({ x: 50, y: 50 });
      setAvatarEditorOpen(false);

      setMessage(t("shared.profile.contentSubmitted"));

      await loadProfile();
    } catch (error) {
      console.error("Lỗi gửi cập nhật profile:", error);
      setMessage(error?.message || t("shared.profile.contentSubmitFailed"));
    } finally {
      setSavingContent(false);
    }
  };

  const savePassword = async () => {
    setMessage("");

    if (!passwordForm.current_password || !passwordForm.new_password) {
      setMessage(t("shared.profile.passwordRequired"));
      return;
    }

    if (passwordForm.new_password !== passwordForm.confirm_password) {
      setMessage(t("auth.forgotPassword.passwordMismatch"));
      return;
    }

    setSavingPassword(true);

    try {
      await apiRequest("/api/member/password", {
        method: "PUT",
        body: JSON.stringify({
          current_password: passwordForm.current_password,
          new_password: passwordForm.new_password,
        }),
      });

      setPasswordForm({
        current_password: "",
        new_password: "",
        confirm_password: "",
      });

      setMessage(t("shared.profile.passwordChanged"));
    } catch (error) {
      setMessage(error?.message || t("shared.profile.passwordChangeFailed"));
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <div className="profile-drawer-layer" role="presentation" onMouseDown={onClose} data-no-translate="true">
      <aside
        className="profile-drawer-panel"
        role="dialog"
        aria-modal="true"
        aria-label={drawerTitle}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="profile-drawer-top">
          <div className="profile-drawer-user">
            <div className="profile-drawer-avatar">
              {avatarUrl ? (
                <span
                  className="profile-drawer-avatar-bg"
                  style={{ backgroundImage: `url(${avatarUrl})` }}
                  aria-label={t("shared.profile.avatar")}
                />
              ) : (
                <span className="material-symbols-outlined">person</span>
              )}
            </div>

            <div>
              <span className="profile-drawer-kicker">{drawerRoleLabel}</span>
              <h2>{drawerTitle}</h2>
              <p>{loading ? t("shared.profile.loadingInfo") : displayName}</p>
            </div>
          </div>

          <button type="button" className="profile-drawer-close" onClick={onClose} aria-label={t("auth.close")}>
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {message && <div className="profile-drawer-message">{message}</div>}

        <section className="profile-drawer-card">
          <div className="profile-drawer-card-title">
            <span className="material-symbols-outlined">badge</span>
            <div>
              <h3>{t("shared.profile.basicInfo")}</h3>
              <p>{t("shared.profile.basicInfoHelp")}</p>
            </div>
          </div>

          <div className="profile-drawer-grid">
            <label className="profile-drawer-full">
              <span>{t("shared.profile.displayNameHint")}</span>
              <input
                name="display_name"
                value={basicForm.display_name}
                onChange={handleFullNameChange}
                placeholder={t("shared.profile.examples.fullName")}
              />
            </label>

            <label>
              <span>{t("shared.profile.surname")}</span>
              <input
                name="surname"
                value={basicForm.surname}
                onChange={updateBasicField}
                placeholder={t("shared.profile.examples.surname")}
              />
            </label>

            <label>
              <span>{t("shared.profile.middleName")}</span>
              <input
                name="middle_name"
                value={basicForm.middle_name}
                onChange={updateBasicField}
                placeholder={t("shared.profile.examples.middleName")}
              />
            </label>

            <label>
              <span>{t("common.firstName")}</span>
              <input
                name="first_name"
                value={basicForm.first_name}
                onChange={updateBasicField}
                placeholder={t("shared.profile.examples.firstName")}
              />
            </label>

            <label>
              <span>{t("auth.login.emailPlaceholder")}</span>
              <input
                name="email"
                type="email"
                value={basicForm.email}
                onChange={updateBasicField}
                placeholder="email@example.com"
              />
            </label>

            <label>
              <span>{t("common.hometown")}</span>
              <input
                name="hometown"
                value={basicForm.hometown}
                onChange={updateBasicField}
                placeholder={t("shared.profile.examples.hometown")}
              />
            </label>

            <label>
              <span>{t("shared.profile.generation")}</span>
              <input
                name="generation"
                type="number"
                min="1"
                value={basicForm.generation}
                onChange={updateBasicField}
                placeholder={t("shared.profile.examples.generation")}
              />
            </label>
          </div>

          <button
            type="button"
            className="profile-drawer-primary"
            onClick={saveBasicInfo}
            disabled={loading || savingBasic}
          >
            <span className="material-symbols-outlined">save</span>
            {savingBasic ? t("shared.upload.saving") : t("shared.profile.saveBasic")}
          </button>
        </section>

        <section className="profile-drawer-card">
          <div className="profile-drawer-card-title">
            <span className="material-symbols-outlined">photo_camera</span>
            <div>
              <h3>{t("shared.profile.photoBio")}</h3>
              <p>{t("shared.profile.photoBioHelp")}</p>
            </div>
          </div>

          {profile.moderation_status === "pending" && (
            <div className="profile-drawer-note">{t("shared.profile.pendingUpdate")}</div>
          )}

          <div className="profile-drawer-full avatar-upload-field">
            <span>{t("shared.profile.avatar")}</span>

            <div className="avatar-picker-row">
              <button
                type="button"
                className="avatar-click-preview"
                onClick={() => {
                  const currentAvatar = avatarPreview || contentForm.avatar_url || profile.avatar_url || currentUser?.avatar_url;
                  if (currentAvatar) {
                    if (!avatarPreview) setAvatarPreview(currentAvatar);
                    setAvatarEditorOpen(true);
                  }
                }}
                title={t("shared.profile.clickEditAvatar")}
              >
                {avatarPreview ? (
                  <span
                    className="avatar-preview-bg"
                    style={{ backgroundImage: `url(${avatarPreview})` }}
                    aria-label={t("shared.profile.avatar")}
                  />
                ) : contentForm.avatar_url || profile.avatar_url || currentUser?.avatar_url ? (
                  <span
                    className="avatar-preview-bg"
                    style={{
                      backgroundImage: `url(${
                        contentForm.avatar_url || profile.avatar_url || currentUser?.avatar_url
                      })`,
                    }}
                    aria-label={t("shared.profile.avatar")}
                  />
                ) : (
                  <div className="avatar-empty-preview">
                    <span className="material-symbols-outlined">add_a_photo</span>
                    <p>{t("shared.profile.noAvatarSelected")}</p>
                  </div>
                )}

                <span className="avatar-edit-hint">
                  <span className="material-symbols-outlined">edit</span>
                </span>
              </button>

              <div className="avatar-picker-actions">
                <input
                  id="avatar-file-input"
                  type="file"
                  accept="image/*"
                  onChange={handleAvatarFileChange}
                  hidden
                />

                <label htmlFor="avatar-file-input" className="avatar-choose-button">
                  <span className="material-symbols-outlined">upload</span>
                  {t("shared.profile.chooseAvatar")}
                </label>

                <button
                  type="button"
                  className="avatar-open-editor-button"
                  onClick={() => {
                    const currentAvatar = avatarPreview || contentForm.avatar_url || profile.avatar_url || currentUser?.avatar_url;
                    if (currentAvatar) {
                      if (!avatarPreview) setAvatarPreview(currentAvatar);
                      setAvatarEditorOpen(true);
                    }
                  }}
                  disabled={!avatarPreview && !contentForm.avatar_url && !profile.avatar_url && !currentUser?.avatar_url}
                >
                  <span className="material-symbols-outlined">crop</span>
                  {t("shared.profile.adjustAvatar")}
                </button>

                {avatarPreview && (
                  <button
                    type="button"
                    className="avatar-remove-button"
                    onClick={() => {
                      if (avatarPreview && avatarPreview.startsWith("blob:")) {
                        URL.revokeObjectURL(avatarPreview);
                      }

                      setAvatarFile(null);
                      setAvatarPreview("");
                      setAvatarZoom(1);
                      setAvatarPosition({ x: 50, y: 50 });
                      setAvatarEditorOpen(false);

                      setContentForm((prev) => ({
                        ...prev,
                        avatar_url: "",
                        avatar_media_id: null,
                      }));
                    }}
                  >
                    {t("shared.profile.removeSelectedAvatar")}
                  </button>
                )}

                <small>
                  {t("shared.profile.avatarHelp")}
                </small>
              </div>
            </div>

            {avatarEditorOpen && (
              <div className="avatar-editor-modal" role="dialog" aria-modal="true">
                <div
                  className="avatar-editor-backdrop"
                  onClick={() => setAvatarEditorOpen(false)}
                />

                <div className="avatar-editor-box">
                  <div className="avatar-editor-header">
                    <div>
                      <h3>{t("shared.profile.editAvatar")}</h3>
                      <p>{t("shared.profile.editAvatarHelp")}</p>
                    </div>

                    <button
                      type="button"
                      className="avatar-editor-close"
                      onClick={() => setAvatarEditorOpen(false)}
                      aria-label={t("auth.close")}
                    >
                      <span className="material-symbols-outlined">close</span>
                    </button>
                  </div>

                  <div
                    className="avatar-edit-frame avatar-edit-frame-large"
                    onMouseDown={handleAvatarDrag}
                    onMouseMove={(event) => {
                      if (event.buttons === 1) {
                        handleAvatarDrag(event);
                      }
                    }}
                    onTouchMove={(event) => {
                      const touch = event.touches?.[0];

                      if (!touch) return;

                      handleAvatarDrag({
                        currentTarget: event.currentTarget,
                        clientX: touch.clientX,
                        clientY: touch.clientY,
                      });
                    }}
                  >
                    {avatarPreview ? (
                      <img
                        src={avatarPreview}
                        alt={t("shared.profile.avatar")}
                        style={{
                          transform: `scale(${avatarZoom})`,
                          transformOrigin: `${avatarPosition.x}% ${avatarPosition.y}%`,
                        }}
                      />
                    ) : contentForm.avatar_url || profile.avatar_url || currentUser?.avatar_url ? (
                      <img
                        src={contentForm.avatar_url || profile.avatar_url || currentUser?.avatar_url}
                        alt={t("shared.profile.avatar")}
                      />
                    ) : (
                      <div className="avatar-empty-preview">
                        <span className="material-symbols-outlined">add_a_photo</span>
                        <p>{t("shared.profile.noAvatarSelected")}</p>
                      </div>
                    )}
                  </div>

                  <div className="avatar-zoom-control">
                    <span>{t("shared.upload.zoom")}</span>
                    <input
                      type="range"
                      min="1"
                      max="2.5"
                      step="0.1"
                      value={avatarZoom}
                      onChange={(event) => setAvatarZoom(Number(event.target.value))}
                    />
                  </div>

                  <div className="avatar-editor-actions">
                    <label htmlFor="avatar-file-input" className="avatar-choose-button">
                      <span className="material-symbols-outlined">image</span>
                      {t("shared.upload.changeImage")}
                    </label>

                    <button
                      type="button"
                      className="avatar-apply-button"
                      onClick={handleApplyAvatarEdit}
                    >
                      <span className="material-symbols-outlined">check</span>
                      {t("shared.profile.apply")}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          <label className="profile-drawer-full">
            <span>{t("shared.profile.bio")}</span>
            <textarea
              name="bio"
              value={contentForm.bio}
              onChange={updateContentField}
              placeholder={t("shared.profile.bioPlaceholder")}
              rows={4}
            />
          </label>

          <button
            type="button"
            className="profile-drawer-secondary"
            onClick={submitProfileContent}
            disabled={loading || savingContent || profile.moderation_status === "pending"}
          >
            <span className="material-symbols-outlined">send</span>
            {savingContent ? t("common.submitting") : t("shared.profile.submitContent")}
          </button>
        </section>

        <section className="profile-drawer-card">
          <div className="profile-drawer-card-title">
            <span className="material-symbols-outlined">lock_reset</span>
            <div>
              <h3>{t("shared.profile.changePassword")}</h3>
              <p>{t("shared.profile.changePasswordHelp")}</p>
            </div>
          </div>

          <div className="profile-drawer-grid">
            <label className="profile-drawer-full">
              <span>{t("shared.profile.currentPassword")}</span>
              <input
                name="current_password"
                type="password"
                value={passwordForm.current_password}
                onChange={updatePasswordField}
                placeholder={t("shared.profile.currentPassword")}
              />
            </label>

            <label>
              <span>{t("shared.profile.newPassword")}</span>
              <input
                name="new_password"
                type="password"
                value={passwordForm.new_password}
                onChange={updatePasswordField}
                placeholder={t("shared.profile.newPassword")}
              />
            </label>

            <label className="profile-drawer-full">
              <span>{t("shared.profile.confirmPassword")}</span>
              <input
                name="confirm_password"
                type="password"
                value={passwordForm.confirm_password}
                onChange={updatePasswordField}
                placeholder={t("shared.profile.confirmPassword")}
              />
            </label>
          </div>

          <button
            type="button"
            className="profile-drawer-primary"
            onClick={savePassword}
            disabled={savingPassword}
          >
            <span className="material-symbols-outlined">vpn_key</span>
            {savingPassword ? t("shared.profile.changingPassword") : t("shared.profile.changePassword")}
          </button>
        </section>
      </aside>
    </div>
  );
}

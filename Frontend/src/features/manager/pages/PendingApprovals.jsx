import { useCallback, useEffect, useMemo, useState } from "react";
import { useLanguage } from "../../../i18n/LanguageContext";
import { mediaUrlFromId } from "../../../shared/utils/media";
import {
  approvePostAPI,
  approveMemoryAPI,
  approveProfileUpdateAPI,
  approveUserAPI,
  getPendingReviewData,
  rejectPostAPI,
  rejectMemoryAPI,
  rejectProfileUpdateAPI,
  rejectUserAPI,
} from "../../../api/managerService";
import { onSocketEvent } from "../../../services/socket";
import { avatarInitial, formatDate, fullName } from "../utils/managerData";
import "./PendingApprovals.css";

const isVideoUrl = (value = "") =>
  /[?&]media=video(?:&|$)/i.test(String(value)) ||
  /\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(String(value));

const safeText = (value, fallback = "") => {
  if (value === null || value === undefined || value === "") return fallback;
  return value;
};

const isImageDataUrl = (value) =>
  typeof value === "string" && value.startsWith("data:image/");

const isImageUrl = (value) =>
  typeof value === "string" &&
  (
    value.startsWith("http") ||
    value.startsWith("/api/media/") ||
    value.startsWith("data:image/") ||
    /\.(png|jpg|jpeg|gif|webp|avif)(\?|#|$)/i.test(value)
  );

const getProfileAvatarPreviewUrl = (profile) => {
  if (profile?.pending_avatar_media_id) {
    return mediaUrlFromId(profile.pending_avatar_media_id);
  }

  if (isImageUrl(profile?.pending_avatar_url)) {
    return profile.pending_avatar_url;
  }

  return "";
};

const truncateText = (value, max = 160) => {
  const text = String(value || "");
  return text.length > max ? `${text.slice(0, max)}...` : text;
};

function MediaPreview({ url, type = "", t }) {
  if (!url) return null;

  const isImage = type === "image" || /\.(png|jpg|jpeg|gif|webp|avif)(\?|#|$)/i.test(url);
  const isVideo = type === "video" || isVideoUrl(url);

  return (
    <a
      className="pending-pro-thumb-link"
      href={url}
      target="_blank"
      rel="noreferrer"
      title={t("manager.pending.items.openAttachment")}
    >
      {isVideo ? (
        <video className="pending-pro-thumb" src={url} muted playsInline preload="metadata" />
      ) : isImage ? (
        <img className="pending-pro-thumb" src={url} alt="" />
      ) : (
        <span className="pending-pro-file material-symbols-outlined">
          {type === "audio" ? "graphic_eq" : "attach_file"}
        </span>
      )}
    </a>
  );
}

export default function PendingApprovals() {
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState("users");
  const [pendingUsers, setPendingUsers] = useState([]);
  const [pendingPosts, setPendingPosts] = useState([]);
  const [pendingProfiles, setPendingProfiles] = useState([]);
  const [pendingMemories, setPendingMemories] = useState([]);

  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [previewProfile, setPreviewProfile] = useState(null);

  const loadPending = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const data = await getPendingReviewData();

      setPendingUsers(data.pendingUsers || []);
      setPendingPosts(data.pendingPosts || []);
      setPendingProfiles(data.pendingProfiles || []);
      setPendingMemories(data.pendingMemories || []);
    } catch (err) {
      setError(err?.message || t("manager.pending.loadingDataError"));
    } finally {
      setLoading(false);
    }
  }, [t]);

useEffect(() => {
  loadPending();

  const cleanupPendingChanged = onSocketEvent(
    "pending_approval_changed",
    (payload) => {
      console.log("Pending approval changed:", payload);
      loadPending();
    }
  );

  return () => {
    cleanupPendingChanged();
  };
}, [loadPending]);

  const totalPending =
    pendingUsers.length +
    pendingPosts.length +
    pendingProfiles.length +
    pendingMemories.length;

  const tabs = [
    {
      key: "users",
      label: t("manager.pending.tabs.users"),
      shortLabel: t("manager.pending.tabs.usersShort"),
      icon: "person_add",
      count: pendingUsers.length,
    },
    {
      key: "posts",
      label: t("manager.pending.tabs.posts"),
      shortLabel: t("manager.pending.tabs.posts"),
      icon: "article",
      count: pendingPosts.length,
    },
    {
      key: "profiles",
      label: t("manager.pending.tabs.profiles"),
      shortLabel: t("manager.pending.tabs.profiles"),
      icon: "badge",
      count: pendingProfiles.length,
    },
    {
      key: "memories",
      label: t("manager.pending.tabs.memories"),
      shortLabel: t("manager.pending.tabs.memories"),
      icon: "collections_bookmark",
      count: pendingMemories.length,
    },
  ];

  const currentTab = tabs.find((tab) => tab.key === activeTab) || tabs[0];

  const normalizeText = (value) =>
    String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();

  const runAction = async (action, successMessage, id = "") => {
    setMessage("");
    setError("");
    setActingId(id);

    try {
      await action();
      setMessage(successMessage);
      await loadPending();
    } catch (err) {
      setError(err?.message || t("common.operationFailed"));
    } finally {
      setActingId("");
    }
  };

  const rejectPost = (id) => {
    const reason = window.prompt(t("manager.pending.prompts.rejectPost"), t("manager.pending.prompts.unsuitableContent"));
    if (reason === null) return;
    runAction(() => rejectPostAPI(id, reason), t("manager.pending.messages.postRejected"), `post-${id}`);
  };

  const rejectProfile = (id) => {
    const reason = window.prompt(t("manager.pending.prompts.rejectProfile"), t("manager.pending.prompts.insufficientInfo"));
    if (reason === null) return;
    runAction(() => rejectProfileUpdateAPI(id, reason), t("manager.pending.messages.profileRejected"), `profile-${id}`);
  };

  const rejectMemory = (id) => {
    const reason = window.prompt(t("manager.pending.prompts.rejectMemory"), t("manager.pending.prompts.unsuitableContent"));
    if (reason === null) return;
    runAction(() => rejectMemoryAPI(id, reason), t("manager.pending.messages.memoryRejected"), `memory-${id}`);
  };

  const filteredUsers = useMemo(() => {
    const q = normalizeText(search);

    return pendingUsers.filter((user) => {
      if (!q) return true;

      return [fullName(user), user.email, user.phone, user.hometown, user.birth_date]
        .filter(Boolean)
        .some((value) => normalizeText(value).includes(q));
    });
  }, [pendingUsers, search]);

  const filteredPosts = useMemo(() => {
    const q = normalizeText(search);

    return pendingPosts.filter((post) => {
      if (!q) return true;

      return [
        post.author_name,
        post.author_email,
        post.description,
        post.content,
        post.image_url,
        post.created_at,
      ]
        .filter(Boolean)
        .some((value) => normalizeText(value).includes(q));
    });
  }, [pendingPosts, search]);

  const filteredProfiles = useMemo(() => {
    const q = normalizeText(search);

    return pendingProfiles.filter((profile) => {
      if (!q) return true;

      return [
        fullName(profile),
        profile.pending_bio,
        profile.email,
        profile.person_id,
      ]
        .filter(Boolean)
        .some((value) => normalizeText(value).includes(q));
    });
  }, [pendingProfiles, search]);

  const filteredMemories = useMemo(() => {
    const q = normalizeText(search);

    return pendingMemories.filter((memory) => {
      if (!q) return true;

      return [
        memory.title,
        memory.author_name,
        memory.content,
        memory.original_filename,
        memory.media_url,
        memory.created_at,
      ]
        .filter(Boolean)
        .some((value) => normalizeText(value).includes(q));
    });
  }, [pendingMemories, search]);

  const activeCount = {
    users: filteredUsers.length,
    posts: filteredPosts.length,
    profiles: filteredProfiles.length,
    memories: filteredMemories.length,
  }[activeTab];

  const summaryCards = [
    {
      icon: "pending_actions",
      label: t("manager.pending.summary.total"),
      value: totalPending,
      tone: "gold",
    },
    {
      icon: "person_add",
      label: t("manager.pending.summary.users"),
      value: pendingUsers.length,
      tone: "red",
    },
    {
      icon: "article",
      label: t("manager.pending.summary.posts"),
      value: pendingPosts.length,
      tone: "green",
    },
    {
      icon: "collections_bookmark",
      label: t("manager.pending.summary.memories"),
      value: pendingMemories.length,
      tone: "slate",
    },
  ];

  return (
    <div className="pending-page pending-pro-page">
      <section className="pending-pro-hero">
        <div className="pending-pro-hero-left">
          <div className="pending-pro-hero-icon">
            <span className="material-symbols-outlined">fact_check</span>
          </div>

          <div>
            <span className="pending-pro-kicker">{t("manager.pending.hero.kicker")}</span>
            <h2>{t("manager.pending.hero.title")}</h2>
            <p>{t("manager.pending.hero.description")}</p>
          </div>
        </div>

        <div className="pending-pro-hero-actions">
          <button
            className="pending-pro-btn pending-pro-btn-light"
            type="button"
            onClick={loadPending}
            disabled={loading}
          >
            <span className="material-symbols-outlined">refresh</span>
            {loading ? t("common.loading") : t("common.reload")}
          </button>
        </div>
      </section>

      {message && <div className="manager-inline-message pending-pro-alert">{message}</div>}
      {error && <div className="manager-inline-error pending-pro-alert">{error}</div>}

      <section className="pending-pro-summary-grid">
        {summaryCards.map((card) => (
          <div key={card.label} className={`pending-pro-summary-card ${card.tone}`}>
            <span className="material-symbols-outlined">{card.icon}</span>

            <div>
              <strong>{loading ? "..." : card.value}</strong>
              <p>{card.label}</p>
            </div>
          </div>
        ))}
      </section>

      <section className="pending-pro-control-panel">
        <div className="pending-pro-tabs">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              className={`pending-pro-tab ${activeTab === tab.key ? "active" : ""}`}
              type="button"
              onClick={() => setActiveTab(tab.key)}
            >
              <span className="material-symbols-outlined">{tab.icon}</span>
              <span>{tab.shortLabel}</span>
              <b>{tab.count}</b>
            </button>
          ))}
        </div>

        <div className="pending-pro-search">
          <span className="material-symbols-outlined">search</span>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("manager.pending.searchPlaceholder", { category: currentTab.label.toLowerCase() })}
          />
        </div>
      </section>

      <section className="pending-pro-content-card">
        <div className="pending-pro-content-head">
          <div>
            <h3>{currentTab.label}</h3>
            <p>
              {t("manager.pending.contentCount", { count: activeCount, category: currentTab.label.toLowerCase() })}
            </p>
          </div>

          <span className="pending-pro-badge">
            {t("manager.pending.pendingCount", { count: currentTab.count })}
          </span>
        </div>

        <div className="pending-pro-list">
          {loading && (
            <div className="pending-pro-empty">
              <span className="material-symbols-outlined">progress_activity</span>
              {t("manager.pending.loadingData")}
            </div>
          )}

          {!loading && activeTab === "users" && (
            <>
              {filteredUsers.map((user) => (
                <article key={user.account_id} className="pending-pro-item">
                  <div className="pending-pro-main">
                    <div className="pending-pro-avatar">{avatarInitial(user)}</div>

                    <div className="pending-pro-info">
                      <span className="pending-pro-type">{t("manager.pending.tabs.users")}</span>
                      <h4>{fullName(user)}</h4>
                      <p>{safeText(user.email, t("manager.pending.items.emailPlaceholder"))}</p>

                      <div className="pending-pro-meta">
                        <span>{t("common.birthDate")}: {formatDate(user.birth_date)}</span>
                        {user.hometown && <span>{t("common.hometown")}: {user.hometown}</span>}
                      </div>
                    </div>
                  </div>

                  <div className="pending-pro-actions">
                    <button
                      className="pending-pro-approve"
                      type="button"
                      disabled={actingId === `user-${user.account_id}`}
                      onClick={() =>
                        runAction(
                          () => approveUserAPI(user.account_id),
                          t("manager.pending.messages.userApproved"),
                          `user-${user.account_id}`
                        )
                      }
                    >
                      <span className="material-symbols-outlined">check_circle</span>
                      {t("common.approve")}
                    </button>

                    <button
                      className="pending-pro-reject"
                      type="button"
                      disabled={actingId === `user-${user.account_id}`}
                      onClick={() =>
                        runAction(
                          () => rejectUserAPI(user.account_id),
                          t("manager.pending.messages.userRejected"),
                          `user-${user.account_id}`
                        )
                      }
                    >
                      <span className="material-symbols-outlined">cancel</span>
                      {t("common.reject")}
                    </button>
                  </div>
                </article>
              ))}

              {!filteredUsers.length && (
                <div className="pending-pro-empty">
                  <span className="material-symbols-outlined">verified</span>
                  {t("manager.pending.empty.users")}
                </div>
              )}
            </>
          )}

          {!loading && activeTab === "posts" && (
            <>
              {filteredPosts.map((post) => (
                <article key={post.post_id} className="pending-pro-item">
                  <div className="pending-pro-main">
                    <MediaPreview url={post.image_url} t={t} />

                    {!post.image_url && (
                      <div className="pending-pro-avatar pending-pro-avatar-soft">
                        <span className="material-symbols-outlined">article</span>
                      </div>
                    )}

                    <div className="pending-pro-info">
                      <span className="pending-pro-type">{t("manager.pending.tabs.posts")}</span>
                      <h4>{post.author_name || post.author_email || t("manager.pending.items.author")}</h4>

                      <p className="pending-pro-preview">
                        {post.description || post.content || t("manager.pending.items.noContent")}
                      </p>

                      {post.image_url && (
                        <a
                          className="pending-pro-link"
                          href={post.image_url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {post.image_url}
                        </a>
                      )}

                      <div className="pending-pro-meta">
                        <span>{formatDate(post.created_at)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="pending-pro-actions">
                    <button
                      className="pending-pro-approve"
                      type="button"
                      disabled={actingId === `post-${post.post_id}`}
                      onClick={() =>
                        runAction(
                          () => approvePostAPI(post.post_id),
                          t("manager.pending.messages.postApproved"),
                          `post-${post.post_id}`
                        )
                      }
                    >
                      <span className="material-symbols-outlined">check_circle</span>
                      {t("manager.pending.actions.approvePost")}
                    </button>

                    <button
                      className="pending-pro-reject"
                      type="button"
                      disabled={actingId === `post-${post.post_id}`}
                      onClick={() => rejectPost(post.post_id)}
                    >
                      <span className="material-symbols-outlined">cancel</span>
                      {t("common.reject")}
                    </button>
                  </div>
                </article>
              ))}

              {!filteredPosts.length && (
                <div className="pending-pro-empty">
                  <span className="material-symbols-outlined">verified</span>
                  {t("manager.pending.empty.posts")}
                </div>
              )}
            </>
          )}

          {!loading && activeTab === "profiles" && (
            <>
              {filteredProfiles.map((profile) => (
                <article key={profile.person_id} className="pending-pro-item">
                  <div className="pending-pro-main">
                    <div className="pending-pro-avatar">{avatarInitial(profile)}</div>

                    <div className="pending-pro-info">
                      <span className="pending-pro-type">{t("manager.pending.tabs.profiles")}</span>
                      <h4>{fullName(profile)}</h4>

                      <div className="pending-pro-change-box">
                        <p>
                          <b>{t("manager.pending.items.newBio")}</b> {truncateText(profile.pending_bio || t("common.noChange"), 160)}
                        </p>

                        {getProfileAvatarPreviewUrl(profile) ? (
                          <div className="pending-pro-profile-media">
                            <b>{t("manager.pending.items.newPhoto")}</b>
                            <a
                              href={getProfileAvatarPreviewUrl(profile)}
                              target="_blank"
                              rel="noreferrer"
                              className="pending-pro-profile-image-link"
                            >
                              <img
                                src={getProfileAvatarPreviewUrl(profile)}
                                alt={t("manager.pending.items.newPhoto")}
                                className="pending-pro-profile-image"
                              />
                            </a>
                          </div>
                        ) : (
                          <p>
                            <b>{t("manager.pending.items.newPhoto")}</b> {t("common.noChange")}
                          </p>
                        )}

                        {isImageDataUrl(profile.pending_avatar_url) && (
                          <p className="pending-pro-muted">
                            {t("manager.pending.items.base64Notice")}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="pending-pro-actions">
                    <button
                      className="pending-pro-btn pending-pro-btn-light"
                      type="button"
                      onClick={() => setPreviewProfile(profile)}
                    >
                      <span className="material-symbols-outlined">visibility</span>
                      {t("common.preview")}
                    </button>

                    <button
                      className="pending-pro-approve"
                      type="button"
                      disabled={actingId === `profile-${profile.person_id}`}
                      onClick={() =>
                        runAction(
                          () => approveProfileUpdateAPI(profile.person_id),
                          t("manager.pending.messages.profileApproved"),
                          `profile-${profile.person_id}`
                        )
                      }
                    >
                      <span className="material-symbols-outlined">check_circle</span>
                      {t("common.approve")}
                    </button>

                    <button
                      className="pending-pro-reject"
                      type="button"
                      disabled={actingId === `profile-${profile.person_id}`}
                      onClick={() => rejectProfile(profile.person_id)}
                    >
                      <span className="material-symbols-outlined">cancel</span>
                      {t("common.reject")}
                    </button>
                  </div>
                </article>
              ))}

              {!filteredProfiles.length && (
                <div className="pending-pro-empty">
                  <span className="material-symbols-outlined">verified</span>
                  {t("manager.pending.empty.profiles")}
                </div>
              )}
            </>
          )}

          {!loading && activeTab === "memories" && (
            <>
              {filteredMemories.map((memory) => (
                <article key={memory.id} className="pending-pro-item">
                  <div className="pending-pro-main">
                    <MediaPreview url={memory.media_url} type={memory.media_type} t={t} />

                    {!memory.media_url && (
                      <div className="pending-pro-avatar pending-pro-avatar-soft">
                        <span className="material-symbols-outlined">collections_bookmark</span>
                      </div>
                    )}

                    <div className="pending-pro-info">
                      <span className="pending-pro-type">{t("manager.pending.tabs.memories")}</span>
                      <h4>{memory.title || t("manager.pending.tabs.memories")}</h4>
                      <p>{memory.author_name || t("manager.pending.items.author")}</p>

                      <p className="pending-pro-preview">
                        {memory.content || memory.original_filename || t("manager.pending.items.noContent")}
                      </p>

                      <div className="pending-pro-meta">
                        <span>{formatDate(memory.created_at)}</span>
                        {memory.media_type && <span>{t("manager.pending.items.fileType")} {memory.media_type}</span>}
                      </div>
                    </div>
                  </div>

                  <div className="pending-pro-actions">
                    <button
                      className="pending-pro-approve"
                      type="button"
                      disabled={actingId === `memory-${memory.id}`}
                      onClick={() =>
                        runAction(
                          () => approveMemoryAPI(memory.id),
                          t("manager.pending.messages.memoryApproved"),
                          `memory-${memory.id}`
                        )
                      }
                    >
                      <span className="material-symbols-outlined">check_circle</span>
                      {t("manager.pending.actions.approveMemory")}
                    </button>

                    <button
                      className="pending-pro-reject"
                      type="button"
                      disabled={actingId === `memory-${memory.id}`}
                      onClick={() => rejectMemory(memory.id)}
                    >
                      <span className="material-symbols-outlined">cancel</span>
                      {t("common.reject")}
                    </button>
                  </div>
                </article>
              ))}

              {!filteredMemories.length && (
                <div className="pending-pro-empty">
                  <span className="material-symbols-outlined">verified</span>
                  {t("manager.pending.empty.memories")}
                </div>
              )}
            </>
          )}
        </div>
      </section>

      {previewProfile && (
        <div
          className="pending-pro-preview-overlay"
          onClick={() => setPreviewProfile(null)}
        >
          <div
            className="pending-pro-preview-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="pending-pro-preview-head">
              <h3>{t("manager.pending.preview.title")}</h3>
              <button type="button" onClick={() => setPreviewProfile(null)} aria-label={t("common.close")}>
                ×
              </button>
            </div>

            <div className="pending-pro-preview-body">
              <p>
                <b>{t("common.member")}:</b> {fullName(previewProfile)}
              </p>

              <div className="pending-pro-preview-grid">
                <div>
                  <h4>{t("manager.pending.preview.currentInfo")}</h4>

                  <p>
                    <b>{t("manager.pending.preview.currentBio")}</b>{" "}
                    {previewProfile.current_bio || t("manager.pending.preview.noCurrentBio")}
                  </p>

                  {previewProfile.current_avatar_media_id ||
                  previewProfile.current_avatar_url ? (
                    <img
                      src={
                        previewProfile.current_avatar_media_id
                          ? mediaUrlFromId(previewProfile.current_avatar_media_id)
                          : previewProfile.current_avatar_url
                      }
                      alt={t("manager.pending.preview.currentInfo")}
                      className="pending-pro-preview-image"
                    />
                  ) : (
                    <p className="pending-pro-muted">{t("manager.pending.preview.noCurrentPhoto")}</p>
                  )}
                </div>

                <div>
                  <h4>{t("manager.pending.preview.newInfo")}</h4>

                  <p>
                    <b>{t("manager.pending.items.newBio")}</b>{" "}
                    {previewProfile.pending_bio || t("manager.pending.items.noBioChange")}
                  </p>

                  {getProfileAvatarPreviewUrl(previewProfile) ? (
                    <img
                      src={getProfileAvatarPreviewUrl(previewProfile)}
                      alt={t("manager.pending.preview.newInfo")}
                      className="pending-pro-preview-image"
                    />
                  ) : (
                    <p className="pending-pro-muted">{t("manager.pending.items.noPhotoChange")}</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
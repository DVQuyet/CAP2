import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import {
  addPostComment,
  getGeneralPosts,
  getPostComments,
  submitMaterial,
  togglePostLike,
} from "../../../api/memberService";
import ImageUpload from "../../../shared/components/ImageUpload";
import { formatDateTimeVN } from "../../../shared/utils/dateFormat";
import { getSocket } from "../../../services/socket";
import "./GeneralPosts.css";

const emptyPostForm = {
  type: "story",
  description: "",
  content: "",
  image_url: "",
  media_type: "",
};

function formatDate(value, t) {
  if (!value) return t("posts.card.notUpdated");
  return formatDateTimeVN(value);
}

function buildPostDescription(post, t) {
  const description = String(post?.description || "").trim();
  if (description) return description;

  const content = String(post?.content || "").trim();
  if (!content) return t("posts.card.imagePost");
  return content.length > 180 ? `${content.slice(0, 177)}...` : content;
}

function getAuthorName(post, t) {
  return post?.author_name || post?.created_by_name || post?.email || t("posts.card.clanMember");
}

function getPostMediaUrl(post) {
  return String(post?.image_url || post?.media_url || "").trim();
}

function isVideoMedia(value, explicitType = "") {
  const type = String(explicitType || "").toLowerCase();
  const url = String(value || "").toLowerCase();
  return type.startsWith("video/") || /[?&]media=video(?:&|$)/.test(url) || /\.(mp4|webm|mov|m4v)(\?|#|$)/.test(url);
}

function PostMedia({ url, mediaType = "", detail = false, t }) {
  if (!url) return null;
  if (isVideoMedia(url, mediaType)) {
    return (
      <video
        className={detail ? "post-detail-video" : "feed-post-video"}
        src={url}
        controls={detail}
        muted={!detail}
        playsInline
        preload="metadata"
      />
    );
  }
  return <img src={url} alt={t("posts.card.postMediaAlt")} />;
}

function PostCard({ post, onOpen, onLike, liking, t }) {
  const text = post.content || post.description || t("posts.card.imagePost");
  const mediaUrl = getPostMediaUrl(post);

  return (
    <article className="feed-post-card">
      <header className="feed-post-author-row">
        <button type="button" className="feed-author-button" onClick={() => onOpen(post)}>
          <span className="feed-avatar">
            <img src="/logo.png" alt="" />
          </span>
          <span className="feed-author-text">
            <strong>{getAuthorName(post, t)}</strong>
            <time>{formatDate(post.created_at, t)}</time>
          </span>
        </button>
      </header>

      <button type="button" className="feed-post-content-button" onClick={() => onOpen(post)}>
        <p className="feed-post-text">{text}</p>
      </button>

      {mediaUrl ? (
        <button type="button" className="feed-post-media" onClick={() => onOpen(post)}>
          <PostMedia url={mediaUrl} mediaType={post.media_type || post.mime_type || ""} t={t} />
        </button>
      ) : null}

      <div className="feed-post-stats">
        <span>{t("posts.card.likes", { count: Number(post.like_count || 0) })}</span>
        <span>{t("posts.card.comments", { count: Number(post.comment_count || 0) })}</span>
      </div>

      <div className="feed-post-actions">
        <button type="button" className={post.liked_by_me ? "is-liked" : ""} onClick={() => onLike(post)} disabled={liking}>
          <span className="material-symbols-outlined">{post.liked_by_me ? "favorite" : "favorite_border"}</span>
          <span>{t("posts.card.like")}</span>
        </button>
        <button type="button" onClick={() => onOpen(post)}>
          <span className="material-symbols-outlined">chat_bubble</span>
          <span>{t("posts.card.comment")}</span>
        </button>
        <button type="button" onClick={() => onOpen(post)}>
          <span className="material-symbols-outlined">visibility</span>
          <span>{t("posts.card.view")}</span>
        </button>
      </div>
    </article>
  );
}

function FeedComposer({ onOpen, t }) {
  return (
    <section className="feed-composer-card">
      <div className="feed-composer-top">
        <span className="feed-avatar is-small">
          <img src="/logo.png" alt="" />
        </span>
        <button type="button" className="feed-composer-input" onClick={() => onOpen("story")}>
          {t("posts.composer.placeholder")}
        </button>
      </div>
      <div className="feed-composer-actions">
        <button type="button" onClick={() => onOpen("media")}>
          <span className="material-symbols-outlined">perm_media</span>
          {t("posts.composer.media")}
        </button>
        <button type="button" onClick={() => onOpen("story")}>
          <span className="material-symbols-outlined">history_edu</span>
          {t("posts.composer.story")}
        </button>
      </div>
    </section>
  );
}

function AddPostModal({ form, error, notice, submitting, onChange, onClose, onSubmit, t }) {
  return (
    <div className="post-modal-backdrop" onMouseDown={onClose}>
      <section className="post-modal post-compose-modal" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
        <header className="post-modal-head">
          <div>
            <h2>{t("posts.modal.create.title")}</h2>
            <p>{t("posts.modal.create.subtitle")}</p>
          </div>
          <button type="button" className="post-icon-btn" onClick={onClose} aria-label={t("common.close") || "Close"}>
            <span className="material-symbols-outlined">close</span>
          </button>
        </header>

        <form className="post-compose-form" onSubmit={onSubmit}>
          <div className="post-type-tabs" role="tablist" aria-label={t("posts.modal.create.tabs.ariaLabel")}>
            <button
              type="button"
              className={form.type === "media" ? "is-active" : ""}
              onClick={() => onChange("type", "media")}
              disabled={submitting}
            >
              <span className="material-symbols-outlined">perm_media</span>
              {t("posts.modal.create.tabs.media")}
            </button>
            <button
              type="button"
              className={form.type !== "media" ? "is-active" : ""}
              onClick={() => onChange("type", "story")}
              disabled={submitting}
            >
              <span className="material-symbols-outlined">history_edu</span>
              {t("posts.modal.create.tabs.story")}
            </button>
          </div>

          <label className="post-field">
            <span>{t("posts.modal.create.fields.title")}</span>
            <input
              value={form.description}
              onChange={(event) => onChange("description", event.target.value)}
              placeholder={t("posts.modal.create.fields.titlePlaceholder")}
              maxLength={255}
              disabled={submitting}
            />
          </label>

          <label className="post-field">
            <span>{t("posts.modal.create.fields.content")}</span>
            <textarea
              rows={8}
              value={form.content}
              onChange={(event) => onChange("content", event.target.value)}
              placeholder={t("posts.modal.create.fields.contentPlaceholder")}
              disabled={submitting}
            />
          </label>

          {form.type === "media" && (
            <ImageUpload
              value={form.image_url}
              disabled={submitting}
              label={t("posts.modal.create.fields.uploadLabel")}
              accept="image/*,video/*"
              allowVideo
              usageType="post_image"
              onUploadSuccess={(url, result = {}) => {
                const mimeType = String(result.mimeType || result.mime_type || "");
                const mediaUrl = mimeType.startsWith("video/") && url && !/[?&]media=video\b/.test(url)
                  ? `${url}${url.includes("?") ? "&" : "?"}media=video`
                  : url;
                onChange("image_url", mediaUrl);
                onChange("media_type", mimeType);
              }}
            />
          )}

          {(error || notice) && <div className={`post-form-message ${error ? "is-error" : "is-success"}`}>{error || notice}</div>}

          <div className="post-modal-actions">
            <button type="button" className="post-secondary-btn" onClick={onClose} disabled={submitting}>
              {t("common.cancel")}
            </button>
            <button type="submit" className="post-primary-btn" disabled={submitting}>
              {submitting ? t("common.submitting") : t("posts.modal.create.submit")}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function PostDetailModal({
  post,
  comments,
  commentsLoading,
  commentText,
  commentError,
  liking,
  commenting,
  onClose,
  onLike,
  onCommentChange,
  onCommentSubmit,
  t,
}) {
  if (!post) return null;

  return (
    <div className="post-modal-backdrop" onMouseDown={onClose}>
      <article className="post-modal post-detail-modal" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
        <header className="post-modal-head">
          <div className="post-detail-title-row">
            <span className="feed-avatar is-small">
              <img src="/logo.png" alt="" />
            </span>
            <div>
              <h2>{getAuthorName(post, t)}</h2>
              <p>{formatDate(post.created_at, t)}</p>
            </div>
          </div>
          <button type="button" className="post-icon-btn" onClick={onClose} aria-label={t("common.close")}>
            <span className="material-symbols-outlined">close</span>
          </button>
        </header>

        <div className="post-detail-body">
          <h3>{buildPostDescription(post, t)}</h3>
          <p>{post.content || post.description || t("posts.card.imagePost")}</p>
        </div>

        {getPostMediaUrl(post) && (
          <div className="post-detail-image">
            <PostMedia url={getPostMediaUrl(post)} mediaType={post.media_type || post.mime_type || ""} detail t={t} />
          </div>
        )}

        <div className="post-detail-toolbar">
          <button type="button" className={`post-like-btn ${post.liked_by_me ? "is-liked" : ""}`} onClick={() => onLike(post)} disabled={liking}>
            <span className="material-symbols-outlined">{post.liked_by_me ? "favorite" : "favorite_border"}</span>
            <span>{t("posts.card.likes", { count: Number(post.like_count || 0) })}</span>
          </button>
          <div className="post-comment-count">
            <span className="material-symbols-outlined">chat_bubble</span>
            <span>{t("posts.card.comments", { count: Number(post.comment_count || 0) })}</span>
          </div>
        </div>

        <section className="post-comments">
          <h3>{t("posts.modal.detail.comments")}</h3>
          {commentsLoading ? (
            <div className="post-empty-state">{t("posts.modal.detail.loadingComments")}</div>
          ) : comments.length === 0 ? (
            <div className="post-empty-state">{t("posts.modal.detail.noComments")}</div>
          ) : (
            <div className="post-comment-list">
              {comments.map((comment) => (
                <article className="post-comment" key={comment.id}>
                  <strong>{comment.author_name || t("posts.modal.detail.member")}</strong>
                  <p>{comment.content}</p>
                  <time>{formatDate(comment.created_at, t)}</time>
                </article>
              ))}
            </div>
          )}

          <form className="post-comment-form" onSubmit={onCommentSubmit}>
            <textarea
              rows={3}
              value={commentText}
              onChange={(event) => onCommentChange(event.target.value)}
              placeholder={t("posts.modal.detail.commentPlaceholder")}
              disabled={commenting}
            />
            {commentError && <div className="post-form-message is-error">{commentError}</div>}
            <button type="submit" className="post-primary-btn" disabled={commenting}>
              {commenting ? t("common.submitting") : t("posts.modal.detail.submitComment")}
            </button>
          </form>
        </section>
      </article>
    </div>
  );
}

export default function GeneralPosts() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [form, setForm] = useState(emptyPostForm);
  const [formError, setFormError] = useState("");
  const [formNotice, setFormNotice] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [selectedPost, setSelectedPost] = useState(null);
  const [comments, setComments] = useState([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [commentError, setCommentError] = useState("");
  const [commenting, setCommenting] = useState(false);
  const [likingPostId, setLikingPostId] = useState(null);

  const selectedPostData = useMemo(
    () => (selectedPost ? posts.find((post) => post.id === selectedPost.id) || selectedPost : null),
    [posts, selectedPost],
  );

  const loadPosts = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await getGeneralPosts();
      setPosts(data.posts || []);
    } catch (err) {
      setError(err?.message || t("posts.messages.loadError"));
      setPosts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadComments = useCallback(async (postId) => {
    setCommentsLoading(true);
    setCommentError("");
    try {
      const data = await getPostComments(postId);
      setComments(data.comments || []);
    } catch (err) {
      setCommentError(err?.message || t("posts.messages.loadCommentsError"));
      setComments([]);
    } finally {
      setCommentsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPosts();
  }, [loadPosts]);
  useEffect(() => {
  let timer = null;
  let cleanup = null;

  const attachPostSocket = () => {
    const socket = getSocket();

    if (!socket) {
      return false;
    }

    const handlePostFeedUpdated = (payload) => {
      console.log("Realtime post_feed_updated received:", payload);

      loadPosts();

      if (selectedPost?.id && Number(payload?.post_id) === Number(selectedPost.id)) {
        loadComments(selectedPost.id);
      }
    };

    socket.on("post_feed_updated", handlePostFeedUpdated);

    cleanup = () => {
      socket.off("post_feed_updated", handlePostFeedUpdated);
    };

    return true;
  };

  if (!attachPostSocket()) {
    timer = window.setInterval(() => {
      if (attachPostSocket()) {
        window.clearInterval(timer);
      }
    }, 500);
  }

  return () => {
    if (timer) {
      window.clearInterval(timer);
    }

    if (cleanup) {
      cleanup();
    }
  };
}, [loadPosts, loadComments, selectedPost?.id]);

  useEffect(() => {
    if (searchParams.get("compose") === "1") {
      setShowAddModal(true);
    }
  }, [searchParams]);

  const updatePost = (postId, updates) => {
    setPosts((current) => current.map((post) => (post.id === postId ? { ...post, ...updates } : post)));
    setSelectedPost((current) => (current?.id === postId ? { ...current, ...updates } : current));
  };

  const changeFormField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
    setFormError("");
    setFormNotice("");
  };

  const closeAddModal = () => {
    setShowAddModal(false);
    setFormError("");
    setFormNotice("");
    if (searchParams.get("compose")) {
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete("compose");
      setSearchParams(nextParams, { replace: true });
    }
  };

  const openPost = (post) => {
    setSelectedPost(post);
    setCommentText("");
    loadComments(post.id);
  };

  const handleSubmitPost = async (event) => {
    event.preventDefault();
    const description = form.description.trim();
    const content = form.content.trim();
    const imageUrl = form.image_url.trim();
    const postType = form.type === "media" ? "media" : "story";

    if (!description) {
      setFormError(t("posts.messages.titleRequired"));
      return;
    }

    if (postType === "media" && !imageUrl) {
      setFormError(t("posts.messages.mediaRequired"));
      return;
    }

    if (postType === "story" && !content) {
      setFormError(t("posts.messages.contentRequired"));
      return;
    }

    setSubmitting(true);
    setFormError("");
    setFormNotice("");
    try {
      const result = await submitMaterial({
        description,
        content: content || description,
        image_url: postType === "media" ? imageUrl : "",
        media_type: form.media_type || "",
      });
      setForm(emptyPostForm);
      setFormNotice(result.message || t("posts.messages.postSuccess"));
      await loadPosts();
      window.setTimeout(closeAddModal, 700);
    } catch (err) {
      setFormError(err?.message || t("posts.messages.postError"));
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleLike = async (post) => {
    setLikingPostId(post.id);
    try {
      const result = await togglePostLike(post.id);
      updatePost(post.id, {
        liked_by_me: result.liked,
        like_count: result.like_count,
      });
    } catch (err) {
      setCommentError(err?.message || t("posts.messages.likeError"));
    } finally {
      setLikingPostId(null);
    }
  };

  const openAddModal = (type = "story") => {
    setForm((current) => ({
      ...current,
      type: type === "media" ? "media" : "story",
      image_url: type === "media" ? current.image_url : "",
      media_type: type === "media" ? current.media_type : "",
    }));
    setFormError("");
    setFormNotice("");
    setShowAddModal(true);
  };

  const handleSubmitComment = async (event) => {
    event.preventDefault();
    if (!selectedPostData) return;

    const content = commentText.trim();
    if (!content) {
      setCommentError(t("posts.messages.commentRequired"));
      return;
    }

    setCommenting(true);
    setCommentError("");
    try {
      const data = await addPostComment(selectedPostData.id, { content });
      setComments((current) => [...current, data.comment]);
      setCommentText("");
      updatePost(selectedPostData.id, {
        comment_count: Number(selectedPostData.comment_count || 0) + 1,
      });
    } catch (err) {
      setCommentError(err?.message || t("posts.messages.commentError"));
    } finally {
      setCommenting(false);
    }
  };

  return (
    <div className="general-posts-page feed-page">
      <header className="general-posts-hero">
        <div>
          <span className="general-posts-kicker">{t("posts.sidebar.title")}</span>
          <h1>{t("posts.title")}</h1>
          <p>{t("posts.subtitle")}</p>
        </div>
      </header>

      <div className="feed-layout">
        <main className="feed-main-column">
          <FeedComposer onOpen={openAddModal} t={t} />
          {error && <div className="post-form-message is-error">{error}</div>}

          {loading ? (
            <div className="post-empty-state">{t("common.loading")}</div>
          ) : posts.length === 0 ? (
            <div className="post-empty-state">{t("posts.messages.noPosts")}</div>
          ) : (
            <div className="feed-post-list">
              {posts.map((post) => (
                <PostCard key={post.id} post={post} onOpen={openPost} onLike={handleToggleLike} liking={likingPostId === post.id} t={t} />
              ))}
            </div>
          )}
        </main>

        <aside className="feed-right-panel">
          <section className="feed-mini-card">
            <h3>{t("posts.sidebar.title")}</h3>
            <p>{t("posts.sidebar.description")}</p>
            <button type="button" className="post-primary-btn" onClick={() => openAddModal("story")}>
              <span className="material-symbols-outlined">add</span>
              {t("posts.sidebar.addPost")}
            </button>
          </section>
        </aside>
      </div>

      {showAddModal && (
        <AddPostModal
          form={form}
          error={formError}
          notice={formNotice}
          submitting={submitting}
          onChange={changeFormField}
          onClose={closeAddModal}
          onSubmit={handleSubmitPost}
          t={t}
        />
      )}

      {selectedPostData && (
        <PostDetailModal
          post={selectedPostData}
          comments={comments}
          commentsLoading={commentsLoading}
          commentText={commentText}
          commentError={commentError}
          liking={likingPostId === selectedPostData.id}
          commenting={commenting}
          onClose={() => setSelectedPost(null)}
          onLike={handleToggleLike}
          onCommentChange={(value) => {
            setCommentText(value);
            setCommentError("");
          }}
          onCommentSubmit={handleSubmitComment}
          t={t}
        />
      )}
    </div>
  );
}

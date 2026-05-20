import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { getGeneralPosts, getMySubmissions } from "../../../api/memberService";
import { formatDateTimeVN } from "../../../shared/utils/dateFormat";
import "./MemberDashboard.css";

function formatDate(value, t) {
  if (!value) return t("posts.card.notUpdated");
  return formatDateTimeVN(value);
}

function statusText(status, t) {
  if (status === "approved") return t("member.submissions.table.status.approved");
  if (status === "rejected") return t("member.submissions.table.status.rejected");
  if (status === "pending") return t("member.submissions.table.status.pending");
  return t("member.submissions.table.status.processing");
}

function postSummary(post, t) {
  return post?.description || post?.content || post?.image_url || t("posts.card.imagePost");
}

export default function MemberSubmissions() {
  const { t } = useTranslation();
  const [posts, setPosts] = useState([]);
  const [submissions, setSubmissions] = useState({ posts: [], profile: {} });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [postResult, submissionResult] = await Promise.allSettled([getGeneralPosts(), getMySubmissions()]);
      setPosts(postResult.status === "fulfilled" ? postResult.value.posts || [] : []);

      if (submissionResult.status === "rejected") throw submissionResult.reason;
      setSubmissions({
        posts: submissionResult.value.posts || [],
        profile: submissionResult.value.profile || {},
      });
    } catch (err) {
      setError(err?.message || t("member.submissions.messages.loadError"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const profileStatus = submissions.profile?.moderation_status;
  const profileSubmissionVisible = Boolean(
    (profileStatus && profileStatus !== "none") ||
      submissions.profile?.pending_bio ||
      submissions.profile?.pending_avatar_url,
  );

  if (loading) {
    return (
      <div className="member-portal-page">
        <section className="member-panel">
          <div className="member-empty">{t("member.submissions.messages.loading")}</div>
        </section>
      </div>
    );
  }

  return (
    <div className="member-portal-page">
      {error && <div className="member-alert is-error">{error}</div>}

      <section className="member-hero-panel">
        <div>
          <span className="member-kicker">{t("member.submissions.title")}</span>
          <h1>{t("member.submissions.history")}</h1>
          <p>{t("member.submissions.heroSubtitle")}</p>
        </div>
        <div className="member-hero-actions">
          <Link to="/user/posts?compose=1" className="member-btn member-btn-primary">
            <span className="material-symbols-outlined">add</span>
            {t("member.submissions.stats.openComposer")}
          </Link>
          <Link to="/user/posts" className="member-btn member-btn-ghost">
            {t("member.submissions.stats.openFeed")}
          </Link>
        </div>
      </section>

      <div className="member-content-grid">
        <section className="member-panel">
          <div className="member-panel-header">
            <div>
              <h2>{t("member.submissions.stats.postToFeed")}</h2>
              <p>{t("member.submissions.stats.postToFeedSubtitle")}</p>
            </div>
          </div>
          <Link to="/user/posts?compose=1" className="member-btn member-btn-primary">
            {t("member.submissions.stats.openComposer")}
          </Link>
        </section>

        <section className="member-panel">
          <div className="member-panel-header">
            <div>
              <h2>{t("member.submissions.stats.approvedPosts")}</h2>
              <p>{t("member.submissions.stats.approvedPostsSubtitle")}</p>
            </div>
            <Link to="/user/posts" className="member-btn member-btn-ghost">
              {t("member.submissions.stats.openFeed")}
            </Link>
          </div>
          <div className="member-feed">
            {posts.length === 0 ? (
              <div className="member-empty">{t("member.dashboard.posts.empty")}</div>
            ) : (
              posts.slice(0, 6).map((post) => (
                <article className="member-post-card" key={post.id}>
                  {post.image_url && <img src={post.image_url} alt="" />}
                  <div>
                    <strong>{post.author_name || t("posts.modal.detail.member")}</strong>
                    <span>{formatDate(post.created_at, t)}</span>
                    <p>{postSummary(post, t)}</p>
                  </div>
                </article>
              ))
            )}
          </div>
        </section>
      </div>

      <section className="member-panel">
        <div className="member-panel-header">
          <div>
            <h2>{t("member.submissions.table.title")}</h2>
            <p>{t("member.submissions.table.subtitle")}</p>
          </div>
        </div>
        <div className="member-table-wrap">
          <table className="member-table">
            <thead>
              <tr>
                <th>{t("member.submissions.table.cols.type")}</th>
                <th>{t("member.submissions.table.cols.content")}</th>
                <th>{t("member.submissions.table.cols.status")}</th>
                <th>{t("member.submissions.table.cols.time")}</th>
                <th>{t("member.submissions.table.cols.note")}</th>
              </tr>
            </thead>
            <tbody>
              {submissions.posts.map((item, index) => (
                <tr key={`${item.created_at || "post"}-${index}`}>
                  <td>{t("member.submissions.table.types.post")}</td>
                  <td>{postSummary(item, t)}</td>
                  <td>
                    <span className={`member-status status-${item.status || "pending"}`}>{statusText(item.status, t)}</span>
                  </td>
                  <td>{formatDate(item.created_at, t)}</td>
                  <td>{item.rejection_reason || t("member.submissions.table.none")}</td>
                </tr>
              ))}

              {profileSubmissionVisible && (
                <tr>
                  <td>{t("member.submissions.table.types.profile")}</td>
                  <td>{submissions.profile.pending_bio || submissions.profile.pending_avatar_url || t("member.profile.mediaBio.title")}</td>
                  <td>
                    <span className={`member-status status-${submissions.profile.moderation_status || "pending"}`}>
                      {statusText(submissions.profile.moderation_status, t)}
                    </span>
                  </td>
                  <td>{t("posts.card.notUpdated")}</td>
                  <td>{submissions.profile.moderation_reason || t("member.submissions.table.none")}</td>
                </tr>
              )}

              {submissions.posts.length === 0 && !profileSubmissionVisible && (
                <tr>
                  <td colSpan={5}>
                    <div className="member-empty">{t("member.submissions.table.empty")}</div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

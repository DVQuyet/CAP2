import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import {
  createMemberReminder,
  getGeneralPosts,
  getMemberChat,
  getMemberDashboard,
  sendMemberChat,
  updateMemberTaskStatus,
} from "../../../api/memberService";

import DateInput from "../../../shared/components/DateInput";
import { getSocket } from "../../../services/socket";
import { formatDateTimeVN, formatDateVN, vietnamDateToIso } from "../../../shared/utils/dateFormat";
import "./MemberDashboard.css";

function formatDate(value, t, withTime = false) {
  if (!value) return t("posts.card.notUpdated");
  return withTime ? formatDateTimeVN(value) : formatDateVN(value);
}

function getTaskLabel(status, t) {
  if (status === "completed") return t("member.dashboard.tasks.status.completed");
  if (status === "in_progress") return t("member.dashboard.tasks.status.inProgress");
  return t("member.dashboard.tasks.status.assigned");
}

function buildDisplayName(profile, t) {
  return (
    profile?.display_name ||
    [profile?.surname, profile?.middle_name, profile?.first_name].filter(Boolean).join(" ").trim() ||
    t("posts.modal.detail.member")
  );
}

const DASHBOARD_POLL_INTERVAL_MS = 60000;

export default function MemberDashboard() {
  const { t } = useTranslation();
  const [dashboard, setDashboard] = useState(null);
  const [chat, setChat] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [posts, setPosts] = useState([]);
  const [reminderForm, setReminderForm] = useState({ title: "", date: "", note: "" });
  const [loading, setLoading] = useState(true);
  const [savingTaskId, setSavingTaskId] = useState(null);
  const [sendingChat, setSendingChat] = useState(false);
  const [savingReminder, setSavingReminder] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const chatListRef = useRef(null);

  const loadDashboard = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError("");
    try {
      const [dashResult, chatResult, postResult] = await Promise.allSettled([
        getMemberDashboard(),
        getMemberChat(),
        getGeneralPosts(),
      ]);

      if (dashResult.status === "rejected") throw dashResult.reason;
      setDashboard(dashResult.value);

      if (chatResult.status === "fulfilled") {
        const messages = chatResult.value.messages || [];
        setChat(
          messages.length
            ? messages.map((m) => ({
                role: m.sender_type === "user" ? "user" : "ai",
                text: m.content,
              }))
            : [
                {
                  role: "ai",
                  text: t("member.dashboard.aiChat.welcome"),
                },
              ],
        );
      }

      if (postResult.status === "fulfilled") {
        setPosts(postResult.value.posts || []);
      } else {
        setPosts([]);
      }
    } catch (err) {
      setError(err?.message || t("member.dashboard.messages.loadError"));
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
  let timer = null;
  let cleanup = null;

  const attachSocketListener = () => {
    const socket = getSocket();

    if (!socket) {
      return false;
    }

    const handleTaskAssigned = (payload) => {
      console.log("Dashboard realtime task_assigned received:", payload);
      loadDashboard(true);
    };

    const handleNewNotification = (payload) => {
      console.log("Dashboard realtime new_notification received:", payload);
      loadDashboard(true);
    };

    socket.on("task_assigned", handleTaskAssigned);
    socket.on("new_notification", handleNewNotification);

    cleanup = () => {
      socket.off("task_assigned", handleTaskAssigned);
      socket.off("new_notification", handleNewNotification);
    };

    return true;
  };

  if (!attachSocketListener()) {
    timer = window.setInterval(() => {
      if (attachSocketListener()) {
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
}, [loadDashboard]);

  useEffect(() => {
    const loadWhenVisible = () => {
      if (document.visibilityState !== "visible") return;
      loadDashboard(true);
    };

    const timer = window.setInterval(loadWhenVisible, DASHBOARD_POLL_INTERVAL_MS);
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        loadDashboard(true);
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [loadDashboard]);

  useEffect(() => {
    if (!chatListRef.current) return;
    chatListRef.current.scrollTop = chatListRef.current.scrollHeight;
  }, [chat]);

  const profile = dashboard?.profile || {};
  const clan = dashboard?.clan || {};
  const treeMembers = dashboard?.treeMembers || [];
  const tasks = dashboard?.assignedTasks || [];
  const reminders = dashboard?.reminders || [];
  const notifications = dashboard?.notifications || [];

  const stats = useMemo(() => {
    const generations = new Set(
      treeMembers
        .map((m) => Number(m.generation))
        .filter((generation) => Number.isFinite(generation) && generation > 0),
    );
    const openTasks = tasks.filter((task) => task.status !== "completed").length;
    const unreadNotifications = notifications.filter((item) => !item.is_read).length;
    const profileFields = [
      profile.surname,
      profile.first_name,
      profile.email,
      profile.hometown,
      profile.generation,
      profile.bio,
      profile.avatar_url,
    ];
    const completeFields = profileFields.filter((value) => value !== null && value !== undefined && String(value).trim() !== "").length;

    return [
      {
        label: t("member.dashboard.stats.treeMembers"),
        value: treeMembers.length,
        icon: "groups",
        tone: "green",
      },
      {
        label: t("member.dashboard.stats.generations"),
        value: generations.size || 0,
        icon: "account_tree",
        tone: "gold",
      },
      {
        label: t("member.dashboard.stats.openTasks"),
        value: openTasks,
        icon: "assignment",
        tone: "blue",
      },
      {
        label: t("member.dashboard.stats.profileComplete"),
        value: `${Math.round((completeFields / profileFields.length) * 100)}%`,
        icon: "badge",
        tone: "red",
      },
      {
        label: t("member.dashboard.stats.unreadNotifications"),
        value: unreadNotifications,
        icon: "notifications",
        tone: "violet",
      },
    ];
  }, [notifications, profile, tasks, treeMembers, t]);

  const handleTaskStatus = async (taskId, status) => {
    setSavingTaskId(taskId);
    setError("");
    setNotice("");
    try {
      await updateMemberTaskStatus(taskId, status);
      setNotice(status === "completed" ? t("member.dashboard.messages.taskUpdateSuccess") : t("member.dashboard.messages.taskUpdateGeneralSuccess"));
      await loadDashboard(true);
    } catch (err) {
      setError(err?.message || t("member.dashboard.messages.taskUpdateError"));
    } finally {
      setSavingTaskId(null);
    }
  };

  const handleCreateReminder = async (event) => {
    event.preventDefault();
    if (!reminderForm.title.trim() || !reminderForm.date) {
      setError(t("member.dashboard.messages.reminderRequired"));
      return;
    }

    setSavingReminder(true);
    setError("");
    setNotice("");
    try {
      await createMemberReminder({
        title: reminderForm.title.trim(),
        date: vietnamDateToIso(reminderForm.date) || null,
        note: reminderForm.note.trim(),
      });
      setReminderForm({ title: "", date: "", note: "" });
      setNotice(t("member.dashboard.messages.reminderSuccess"));
      await loadDashboard(true);
    } catch (err) {
      setError(err?.message || t("member.dashboard.messages.reminderError"));
    } finally {
      setSavingReminder(false);
    }
  };

  const handleSendChat = async () => {
    const text = chatInput.trim();
    if (!text || sendingChat) return;

    setSendingChat(true);
    setError("");
    setChat((current) => [...current, { role: "user", text }]);
    setChatInput("");

    try {
      await sendMemberChat(text);
      const response = await getMemberChat();
      setChat(
        (response.messages || []).map((m) => ({
          role: m.sender_type === "user" ? "user" : "ai",
          text: m.content,
        })),
      );
    } catch (err) {
      setError(err?.message || t("member.dashboard.messages.chatError"));
    } finally {
      setSendingChat(false);
    }
  };

  if (loading) {
    return (
      <div className="member-portal-page">
        <section className="member-panel">
          <div className="member-empty">{t("member.dashboard.messages.loading")}</div>
        </section>
      </div>
    );
  }

  return (
    <div className="member-portal-page">
      {(error || notice) && (
        <div className={`member-alert ${error ? "is-error" : "is-success"}`}>
          {error || notice}
        </div>
      )}

      <section className="member-hero-panel">
        <div>
          <span className="member-kicker">{t("member.dashboard.kicker")}</span>
          <h1>{buildDisplayName(profile, t)}</h1>
          <p>
            {clan.clan_name
              ? t("member.dashboard.clanConnected", { name: clan.clan_name })
              : t("member.dashboard.clanNotConnected")}
          </p>
        </div>
        <div className="member-hero-actions">
          <Link to="/user/family-tree" className="member-btn member-btn-primary">
            <span className="material-symbols-outlined">account_tree</span>
            {t("member.dashboard.viewTree")}
          </Link>
          <Link to="/user/profile" className="member-btn member-btn-ghost">
            <span className="material-symbols-outlined">manage_accounts</span>
            {t("member.dashboard.updateProfile")}
          </Link>
        </div>
      </section>

      <section className="member-stats-grid" aria-label="Chỉ số thành viên">
        {stats.map((card) => (
          <article className={`member-stat-card tone-${card.tone}`} key={card.label}>
            <span className="material-symbols-outlined">{card.icon}</span>
            <div>
              <strong>{card.value}</strong>
              <p>{card.label}</p>
            </div>
          </article>
        ))}
      </section>

      <div className="member-content-grid">
        <section className="member-panel">
          <div className="member-panel-header">
            <div>
              <h2>{t("member.dashboard.tasks.title")}</h2>
              <p>{t("member.dashboard.tasks.subtitle")}</p>
            </div>
          </div>

          <div className="member-list">
            {tasks.length === 0 ? (
              <div className="member-empty">{t("member.dashboard.tasks.empty")}</div>
            ) : (
              tasks.map((task) => (
                <article className="member-task-card" key={task.id}>
                  <div>
                    <div className="member-row-title">{task.title}</div>
                    {task.description && <p>{task.description}</p>}
                    <div className="member-meta">
                      <span>{t("member.dashboard.tasks.manager", { name: task.manager_name || "Manager" })}</span>
                      <span>{t("member.dashboard.tasks.deadline", { date: formatDate(task.due_date, t) })}</span>
                      <span className={`member-status status-${task.status}`}>{getTaskLabel(task.status, t)}</span>
                    </div>
                  </div>
                  {task.status !== "completed" && (
                    <div className="member-task-actions">
                      <button
                        className="member-btn member-btn-ghost"
                        type="button"
                        disabled={savingTaskId === task.id || task.status === "in_progress"}
                        onClick={() => handleTaskStatus(task.id, "in_progress")}
                      >
                        {t("member.dashboard.tasks.actions.start")}
                      </button>
                      <button
                        className="member-btn member-btn-primary"
                        type="button"
                        disabled={savingTaskId === task.id}
                        onClick={() => handleTaskStatus(task.id, "completed")}
                      >
                        {t("member.dashboard.tasks.actions.complete")}
                      </button>
                    </div>
                  )}
                </article>
              ))
            )}
          </div>
        </section>

        <section className="member-panel">
          <div className="member-panel-header">
            <div>
              <h2>{t("member.dashboard.reminders.title")}</h2>
              <p>{t("member.dashboard.reminders.subtitle")}</p>
            </div>
          </div>

          <form className="member-reminder-form" onSubmit={handleCreateReminder}>
            <input
              value={reminderForm.title}
              onChange={(event) => setReminderForm((current) => ({ ...current, title: event.target.value }))}
              placeholder={t("member.dashboard.reminders.placeholderTitle")}
            />
            <DateInput
              value={reminderForm.date}
              onChange={(event) => setReminderForm((current) => ({ ...current, date: event.target.value }))}
            />
            <textarea
              value={reminderForm.note}
              onChange={(event) => setReminderForm((current) => ({ ...current, note: event.target.value }))}
              placeholder={t("member.dashboard.reminders.placeholderNote")}
              rows={3}
            />
            <button className="member-btn member-btn-primary" type="submit" disabled={savingReminder}>
              {t("member.dashboard.reminders.submit")}
            </button>
          </form>

          <div className="member-list compact">
            {reminders.slice(0, 5).map((reminder) => (
              <article className="member-mini-row" key={reminder.id}>
                <strong>{reminder.title}</strong>
                <span>{formatDate(reminder.event_date, t)}</span>
              </article>
            ))}
            {reminders.length === 0 && <div className="member-empty">{t("member.dashboard.reminders.empty")}</div>}
          </div>
        </section>
      </div>

      <div className="member-content-grid">
        <section className="member-panel">
          <div className="member-panel-header">
            <div>
              <h2>{t("member.dashboard.posts.title")}</h2>
              <p>{t("member.dashboard.posts.subtitle")}</p>
            </div>
            <Link to="/user/posts?compose=1" className="member-btn member-btn-ghost">
              {t("member.dashboard.posts.addPost")}
            </Link>
          </div>

          <div className="member-feed">
            {posts.slice(0, 3).map((post) => (
              <article className="member-post-card" key={post.id}>
                {post.image_url && <img src={post.image_url} alt="" />}
                <div>
                  <strong>{post.author_name || t("posts.modal.detail.member")}</strong>
                  <span>{formatDate(post.created_at, t, true)}</span>
                  <p>{post.description || post.content || t("posts.card.imagePost")}</p>
                </div>
              </article>
            ))}
            {posts.length === 0 && <div className="member-empty">{t("member.dashboard.posts.empty")}</div>}
          </div>
        </section>

        <section className="member-panel">
          <div className="member-panel-header">
            <div>
              <h2>{t("member.dashboard.aiChat.title")}</h2>
              <p>{t("member.dashboard.aiChat.subtitle")}</p>
            </div>
          </div>

          <div className="member-chat">
            <div className="member-chat-list" ref={chatListRef}>
              {chat.map((message, index) => (
                <div className={`member-chat-message ${message.role === "user" ? "is-user" : "is-ai"}`} key={`${message.role}-${index}`}>
                  <span>{message.text}</span>
                </div>
              ))}
            </div>
            <div className="member-chat-composer">
              <input
                value={chatInput}
                onChange={(event) => setChatInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") handleSendChat();
                }}
                placeholder={t("member.dashboard.aiChat.placeholder")}
              />
              <button className="member-btn member-btn-primary" type="button" disabled={sendingChat} onClick={handleSendChat}>
                {t("member.dashboard.aiChat.send")}
              </button>
            </div>
          </div>
        </section>
      </div>

      <section className="member-panel">
        <div className="member-panel-header">
          <div>
            <h2>{t("member.dashboard.notifications.title")}</h2>
            <p>{t("member.dashboard.notifications.subtitle")}</p>
          </div>
        </div>
        <div className="member-list compact">
          {notifications.slice(0, 8).map((item) => (
            <article className="member-mini-row" key={item.id}>
              <strong>{item.title || t("member.dashboard.notifications.defaultTitle")}</strong>
              <span>{item.message}</span>
              <small>{formatDate(item.created_at, t, true)}</small>
            </article>
          ))}
          {notifications.length === 0 && <div className="member-empty">{t("member.dashboard.notifications.empty")}</div>}
        </div>
      </section>
    </div>
  );
}

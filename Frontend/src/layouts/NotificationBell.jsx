import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { apiRequest } from "../services/api";
import { onSocketEvent } from "../services/socket";
import { formatDateTimeVN } from "../shared/utils/dateFormat";
import "./NotificationBell.css";

function normalizeLink(linkUrl, role) {
  if (!linkUrl) return role === "manager" ? "/manager/dashboard" : "/user/dashboard";
  if (linkUrl.startsWith("/member/tasks")) return "/user/tasks";
  if (linkUrl.startsWith("/manager/tasks")) return linkUrl;
  return linkUrl;
}

function formatTime(value) {
  if (!value) return "";
  return formatDateTimeVN(value);
}

function normalizeRealtimeNotification(notification, t) {
  return {
    id: notification.id || `realtime-${Date.now()}`,
    title: notification.title || t("shared.notification.new"),
    message: notification.message || t("shared.notification.defaultMessage"),
    link_url: notification.link_url || notification.linkUrl || null,
    is_read: Number(notification.is_read ?? notification.isRead ?? 0),
    created_at: notification.created_at || notification.createdAt || new Date().toISOString(),
    ...notification,
  };
}

const NOTIFICATION_POLL_INTERVAL_MS = 30000;

export default function NotificationBell({ role = "member", buttonClassName = "" }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const wrapperRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const visibleNotifications = useMemo(() => notifications.slice(0, 12), [notifications]);

  const loadNotifications = useCallback(async () => {
    try {
      setLoading(true);
      const data = await apiRequest("/api/member/notifications");
      const items = Array.isArray(data.notifications) ? data.notifications : [];
      setNotifications(items);
      setUnreadCount(Number(data.unread_count ?? items.filter((item) => Number(item.is_read) === 0).length));
    } catch (error) {
      setNotifications([]);
      setUnreadCount(0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const loadWhenVisible = () => {
      if (document.visibilityState !== "visible") return;
      loadNotifications();
    };

    loadWhenVisible();
    const timer = window.setInterval(loadWhenVisible, NOTIFICATION_POLL_INTERVAL_MS);
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        loadNotifications();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [loadNotifications]);

  useEffect(() => {
    const cleanupNewNotification = onSocketEvent("new_notification", (notification) => {
      console.log("New realtime notification:", notification);

      const normalizedNotification = normalizeRealtimeNotification(notification, t);

      let shouldIncreaseUnread = false;

      setNotifications((items) => {
        const safeItems = Array.isArray(items) ? items : [];
        const exists = safeItems.some(
          (item) => String(item.id) === String(normalizedNotification.id)
        );

        if (exists) {
          return safeItems;
        }

        shouldIncreaseUnread = Number(normalizedNotification.is_read) === 0;
        return [normalizedNotification, ...safeItems];
      });

      if (shouldIncreaseUnread) {
        setUnreadCount((count) => Number(count || 0) + 1);
      }
    });

    return cleanupNewNotification;
  }, [t]);

  useEffect(() => {
    if (!open) return undefined;

    const handlePointerDown = (event) => {
      if (!wrapperRef.current?.contains(event.target)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  const markAllRead = async () => {
    try {
      await apiRequest("/api/member/notifications/read-all", { method: "PATCH" });
      setNotifications((items) => items.map((item) => ({ ...item, is_read: 1 })));
      setUnreadCount(0);
    } catch (error) {
      await loadNotifications();
    }
  };

  const openNotification = async (item) => {
    if (!item) return;
    if (Number(item.is_read) === 0) {
      setNotifications((items) => items.map((current) => (current.id === item.id ? { ...current, is_read: 1 } : current)));
      setUnreadCount((count) => Math.max(0, count - 1));
      try {
        await apiRequest(`/api/member/notifications/${item.id}/read`, { method: "PATCH" });
      } catch (error) {
        loadNotifications();
      }
    }

    setOpen(false);
    navigate(normalizeLink(item.link_url, role));
  };

  return (
    <div className="notification-bell" ref={wrapperRef} data-no-translate="true">
      <button
        type="button"
        className={`notification-bell-button ${buttonClassName}`.trim()}
        title={t("shared.notification.title")}
        aria-label={`${t("shared.notification.title")}${unreadCount > 0 ? `, ${t("shared.notification.unread", { count: unreadCount })}` : ""}`}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="material-symbols-outlined">notifications</span>
        {unreadCount > 0 && <span className="notification-badge">{unreadCount > 9 ? "9+" : unreadCount}</span>}
      </button>

      {open && (
        <div className="notification-panel" role="menu">
          <div className="notification-head">
            <div>
              <strong>{t("shared.notification.title")}</strong>
              <span>{unreadCount > 0 ? t("shared.notification.unread", { count: unreadCount }) : t("shared.notification.noneNew")}</span>
            </div>
            {unreadCount > 0 && (
              <button type="button" onClick={markAllRead}>
                {t("shared.notification.markAllRead")}
              </button>
            )}
          </div>

          <div className="notification-list">
            {loading && visibleNotifications.length === 0 && <div className="notification-empty">{t("common.loading")}</div>}
            {!loading && visibleNotifications.length === 0 && <div className="notification-empty">{t("shared.notification.empty")}</div>}
            {visibleNotifications.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`notification-item ${Number(item.is_read) === 0 ? "unread" : ""}`}
                onClick={() => openNotification(item)}
              >
                <span className="notification-item-dot" />
                <span className="notification-item-body">
                  <strong>{item.title || t("shared.notification.new")}</strong>
                  <span>{item.message || t("shared.notification.defaultMessage")}</span>
                  <small>{formatTime(item.created_at)}</small>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

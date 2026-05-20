import { useEffect, useState } from "react";
import { Link, Outlet, useLocation, Navigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { getStoredUser, logout, isAuthenticated } from "../shared/utils/auth";
import { formatDate } from "../shared/utils/dateFormat";
import LanguageToggle from "../shared/components/LanguageToggle";
import "./AdminLayout.css";

const menuItems = [
 
  { icon: "dashboard", labelKey: "layout.adminMenu.overview", path: "/dashboard" },
  { icon: "account_tree", labelKey: "layout.adminMenu.genealogy", path: "/dashboard/genealogy" },
  { icon: "group", labelKey: "layout.adminMenu.accounts", path: "/dashboard/members" },
  { icon: "article", labelKey: "layout.adminMenu.posts", path: "/dashboard/posts" },
  { icon: "assignment", labelKey: "layout.adminMenu.events", path: "/dashboard/tasks" },
  { icon: "workspace_premium", labelKey: "layout.adminMenu.billing", path: "/dashboard/billing" },
  { icon: "calendar_month", labelKey: "layout.adminMenu.calendar", path: "/dashboard/calendar" },
];

export default function AdminLayout() {
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const currentUser = getStoredUser();

  if (!isAuthenticated()) {
    return <Navigate to="/" replace />;
  }

  const handleLogout = () => {
    logout();
    window.location.href = "/";
  };

  return (
    <div className={`admin-portal-container ${sidebarOpen ? "" : "sidebar-collapsed"}`}>
      <aside className="admin-sidebar glass-effect">
        <button
          type="button"
          className="sidebar-toggle"
          onClick={() => setSidebarOpen((v) => !v)}
          title={sidebarOpen ? t("layout.collapse") : t("layout.expand")}
        >
          <span className="material-symbols-outlined">{sidebarOpen ? "chevron_left" : "chevron_right"}</span>
        </button>

        <div className="sidebar-header">
          <Link to="/" className="sidebar-brand">
            <img src={sidebarOpen ? "/gia-pha-full-logo.png" : "/gia-pha-g-logo.png"} alt={t("layout.brand")} />
          </Link>
        </div>

        <div className="sidebar-user-section">
          <div className="admin-avatar-wrapper">
            <span className="material-symbols-outlined">shield_person</span>
          </div>
          <div className="user-details">
            <strong>{currentUser?.name || currentUser?.display_name || "Admin"}</strong>
            <span className="admin-badge-chip">{t("layout.systemAdmin")}</span>
          </div>
        </div>

        <nav className="sidebar-nav">
          {menuItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`nav-item ${location.pathname === item.path ? "active" : ""}`}
            >
              <span className="material-symbols-outlined">{item.icon}</span>
              <span>{t(item.labelKey)}</span>
            </Link>
          ))}
        </nav>

        <div className="sidebar-footer">
          <button type="button" onClick={handleLogout} className="logout-btn">
            <span className="material-symbols-outlined">logout</span>
            <span>{t("common.logout")}</span>
          </button>
        </div>
      </aside>

      <main className="admin-main-content">
        <header className="admin-top-header glass-effect">
          <div className="header-context">
            <h1>{t("layout.adminTitle")}</h1>
            <p>{currentTime.toLocaleTimeString(i18n.language === "vi" ? "vi-VN" : "en-US")} | {formatDate(currentTime, { language: i18n.language })}</p>
          </div>
          <div className="admin-header-utils">
            <LanguageToggle className="admin-util-btn" />
          </div>
        </header>

        <div className="admin-view-body">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

import { useEffect, useState } from "react";
import { Link, Outlet, Navigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { getStoredUser, logout, isAuthenticated } from "../shared/utils/auth";
import { formatDate } from "../shared/utils/dateFormat";
import { useResponsiveSidebar } from "../shared/hooks/useResponsiveSidebar";
import LanguageToggle from "../shared/components/LanguageToggle";
import "./AdminLayout.css";
import PortalNav, { PortalMenuButton } from "./PortalNav";
import { ADMIN_MENU } from "./portalMenus";

export default function AdminLayout() {
  const { t, i18n } = useTranslation();
  const [sidebarOpen, setSidebarOpen] = useResponsiveSidebar(true);
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
          title={sidebarOpen ? t("layout.collapse") : t("layout.expand")} aria-label={sidebarOpen ? t("layout.collapse") : t("layout.expand")}
        >
          <span className="material-symbols-outlined">{sidebarOpen ? "chevron_left" : "chevron_right"}</span>
        </button>

        <div className="sidebar-header">
          <Link to="/" className="sidebar-brand">
            <img src={sidebarOpen ? "/logo-giaphaviet.png" : "/logo.png"} alt={t("layout.brand")} />
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

        <PortalNav groups={ADMIN_MENU} label={t("layout.nav.label")} open={sidebarOpen} setOpen={setSidebarOpen} />

        <div className="sidebar-footer">
          <button type="button" onClick={handleLogout} className="logout-btn">
            <span className="material-symbols-outlined">logout</span>
            <span>{t("common.logout")}</span>
          </button>
        </div>
      </aside>
      {sidebarOpen ? (
        <button
          type="button"
          className="portal-sidebar-backdrop"
          aria-label={t("layout.collapse")}
          onClick={() => setSidebarOpen(false)}
        />
      ) : null}

      <main className="admin-main-content">
        <header className="admin-top-header glass-effect">
          <div className="header-context">
            <h1>{t("layout.adminTitle")}</h1>
            <p>{currentTime.toLocaleTimeString(i18n.language === "vi" ? "vi-VN" : "en-US")} | {formatDate(currentTime, { language: i18n.language })}</p>
          </div>
          <div className="admin-header-utils">
            <PortalMenuButton className="admin-util-btn" onOpen={() => setSidebarOpen(true)} />
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

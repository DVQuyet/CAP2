import { useEffect, useState } from "react";
import { Link, Navigate, Outlet } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { getStoredUser, isAuthenticated, logout as clearAuth } from "../shared/utils/auth";
import { apiRequest } from "../services/api";
import { connectSocketFromStorage, disconnectSocket } from "../services/socket";
import { resolveImageUrl } from "../shared/utils/media";
import { useResponsiveSidebar } from "../shared/hooks/useResponsiveSidebar";
import NotificationBell from "./NotificationBell";
import LanguageToggle from "../shared/components/LanguageToggle";
import ProfileDrawer from "../shared/components/ProfileDrawer";
import AIChatGateway from "../features/ai-chat/components/AIChatGateway";
import "./MemberLayout.css";
import PortalNav, { PortalMenuButton } from "./PortalNav";
import { MEMBER_MENU } from "./portalMenus";

function getUserName(user, fallback) {
  return user?.name || user?.display_name || user?.email || fallback;
}

export default function MemberLayout() {
  const { t } = useTranslation();
  const [currentUser, setCurrentUser] = useState(() => getStoredUser() || {});
  const [sidebarOpen, setSidebarOpen] = useResponsiveSidebar(true);
  const [profileOpen, setProfileOpen] = useState(false);

  useEffect(() => {
    if (!isAuthenticated()) {
      return undefined;
    }

    connectSocketFromStorage();

    return () => {
      disconnectSocket();
    };
  }, []);

  useEffect(() => {
    if (!isAuthenticated()) return undefined;

    let cancelled = false;

    apiRequest("/api/member/dashboard")
      .then((data) => {
        if (cancelled) return;
        const profile = data.profile || {};
        const storedUser = getStoredUser() || {};
        const profileName = profile.display_name || [profile.surname, profile.middle_name, profile.first_name].filter(Boolean).join(" ").trim();
        const nextUser = {
          ...storedUser,
          name: profileName || storedUser.name,
          display_name: profile.display_name || storedUser.display_name,
          email: profile.email || storedUser.email,
          role_id: profile.role_id || storedUser.role_id,
          status: profile.status || storedUser.status,
          avatar_url: resolveImageUrl({
            mediaId: profile.pending_avatar_media_id || profile.avatar_media_id,
            avatar_url: profile.pending_avatar_url || profile.avatar_url || storedUser.avatar_url || "",
          }),
          avatar_media_id: profile.pending_avatar_media_id || profile.avatar_media_id || storedUser.avatar_media_id || null,
        };
        localStorage.setItem("auth_user", JSON.stringify(nextUser));
        localStorage.setItem("user", JSON.stringify(nextUser));
        setCurrentUser(nextUser);
      })
      .catch(() => {
        if (!cancelled) setCurrentUser(getStoredUser() || {});
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (!isAuthenticated()) {
    return <Navigate to="/" replace />;
  }

  const handleLogout = () => {
    clearAuth();
    window.location.href = "/";
  };

  return (
    <div className={`member-portal-container ${sidebarOpen ? "" : "sidebar-collapsed"}`}>
      <aside className="member-sidebar glass-effect" aria-label={t("layout.memberTitle")}>
        <button
          type="button"
          className="member-sidebar-toggle"
          onClick={() => setSidebarOpen((value) => !value)}
          title={sidebarOpen ? t("layout.collapseMenu") : t("layout.openMenu")}
          aria-label={sidebarOpen ? t("layout.collapseMenu") : t("layout.openMenu")}
          aria-expanded={sidebarOpen}
        >
          <span className="material-symbols-outlined">{sidebarOpen ? "chevron_left" : "chevron_right"}</span>
        </button>
        <div className="sidebar-header">
          <Link to="/" className="sidebar-brand">
            <img src={sidebarOpen ? "/logo-giaphaviet.png" : "/logo.png"} alt={t("layout.brand")} />
            <span>{t("layout.brand")}</span>
          </Link>
        </div>

        <button type="button" className="sidebar-user-profile" onClick={() => setProfileOpen(true)} title={t("common.editProfile")}>
          <div className="profile-img-container">
            <img src={resolveImageUrl({ mediaId: currentUser?.avatar_media_id, avatar_url: currentUser?.avatar_url, fallback: "/logo.png" })} alt="" className="user-avatar-circle" />
            <div className="status-indicator online" />
          </div>
          <div className="user-text">
            <h4>{getUserName(currentUser, t("layout.familyMember"))}</h4>
            <span className="role-text">{t("layout.familyMember")}</span>
          </div>
        </button>

        <PortalNav groups={MEMBER_MENU} label={t("layout.memberNavigation")} open={sidebarOpen} setOpen={setSidebarOpen} />

        <div className="member-sidebar-footer">
          <button type="button" onClick={handleLogout} className="member-logout-link">
            <span className="material-symbols-outlined">logout</span>
            <span>{t("common.logout")}</span>
          </button>
        </div>
      </aside>
      {sidebarOpen ? (
        <button
          type="button"
          className="portal-sidebar-backdrop"
          aria-label={t("layout.collapseMenu")}
          onClick={() => setSidebarOpen(false)}
        />
      ) : null}

      <main className="member-main-content">
        <header className="member-topbar glass-effect">
          <div className="topbar-welcome">
            <span className="material-symbols-outlined">waving_hand</span>
            <span>
              {t("common.welcome")}, <strong>{getUserName(currentUser, t("layout.familyMember"))}</strong>
            </span>
          </div>
          <div className="member-topbar-actions">
            <PortalMenuButton className="top-icon-btn glass-btn" onOpen={() => setSidebarOpen(true)} />
            <NotificationBell role="member" buttonClassName="top-icon-btn glass-btn" />
            <LanguageToggle className="top-icon-btn glass-btn" />
            <div className="divider" />
            <button type="button" className="top-icon-btn glass-btn" onClick={() => setProfileOpen(true)} title={t("common.editProfile")} aria-label={t("common.editProfile")}>
              <span className="material-symbols-outlined">settings</span>
            </button>
          </div>
        </header>

        <section className="member-page-body">
          <Outlet />
        </section>
      </main>

      <ProfileDrawer
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
        currentUser={currentUser}
        setCurrentUser={setCurrentUser}
        roleLabel={t("layout.familyMember")}
        title={t("common.editProfile")}
      />
      <AIChatGateway />
    </div>
  );
}

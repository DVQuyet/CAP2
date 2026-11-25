import { useEffect, useState } from "react";
import { Link, Outlet, Navigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { getStoredUser, logout, isAuthenticated } from "../shared/utils/auth";
import { formatDate } from "../shared/utils/dateFormat";
import { apiRequest } from "../services/api";
import { connectSocketFromStorage } from "../services/socket";
import { resolveImageUrl } from "../shared/utils/media";
import { useResponsiveSidebar } from "../shared/hooks/useResponsiveSidebar";
import NotificationBell from "./NotificationBell";
import LanguageToggle from "../shared/components/LanguageToggle";
import ProfileDrawer from "../shared/components/ProfileDrawer";
import HelpDialog from "../shared/components/HelpDialog";
import AIChatGateway from "../features/ai-chat/components/AIChatGateway";
import "./ManagerLayout.css";
import PortalNav, { PortalMenuButton } from "./PortalNav";
import { MANAGER_MENU } from "./portalMenus";

export default function ManagerLayout() {
  const { t, i18n } = useTranslation();
  const [currentUser, setCurrentUser] = useState(() => getStoredUser());
  const [sidebarOpen, setSidebarOpen] = useResponsiveSidebar(true);
  const [accountOpen, setAccountOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(() => {
    if (!isAuthenticated()) {
      return undefined;
    }

    connectSocketFromStorage();

    return undefined;
  }, [t]);

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
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  const handleLogout = () => {
    logout();
    window.location.href = "/";
  };

  const openAccountModal = () => {
    setAccountOpen(true);
  };

  // Đặt sau toàn bộ hook để thứ tự hook không đổi giữa các lần render.
  if (!isAuthenticated()) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className={`manager-portal-container ${sidebarOpen ? "" : "sidebar-collapsed"}`}>
      <aside className="manager-sidebar glass-effect" aria-label={t("layout.managerTitle")}>
        <button
          type="button"
          className="sidebar-toggle"
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
          </Link>
        </div>

        <button type="button" className="sidebar-user-section" onClick={openAccountModal} title={t("layout.editAccount")}>
          <div className="manager-avatar-wrapper">
           {(() => {
            const avatarSrc = resolveImageUrl({
              mediaId: currentUser?.avatar_media_id,
              avatar_url: currentUser?.avatar_url,
          });

            return avatarSrc ? (
              <img src={avatarSrc} alt="" className="manager-avatar-img" />
            ) : (
              <span className="material-symbols-outlined">manage_accounts</span>
            );
        })()}
          </div>
          <div className="user-details">
            <strong>{currentUser?.name || currentUser?.display_name || "Manager"}</strong>
            <span className="role-chip">{t("layout.clanManager")}</span>
          </div>
        </button>

        <PortalNav groups={MANAGER_MENU} label={t("layout.nav.label")} open={sidebarOpen} setOpen={setSidebarOpen} />

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
          aria-label={t("layout.collapseMenu")}
          onClick={() => setSidebarOpen(false)}
        />
      ) : null}

      <main className="manager-main-content">
        <header className="manager-top-header glass-effect">
          <div className="header-context">
            <h1>{t("layout.managerTitle")}</h1>
            <p>{t("layout.session", { date: formatDate(new Date(), { language: i18n.language }) })}</p>
          </div>
          <div className="header-utils">
            <PortalMenuButton className="util-btn" onOpen={() => setSidebarOpen(true)} />
            <NotificationBell role="manager" buttonClassName="util-btn" />
            <LanguageToggle className="util-btn" />
            <button className="util-btn" title={t("layout.editAccount")} aria-label={t("layout.editAccount")} onClick={openAccountModal}>
              <span className="material-symbols-outlined">account_circle</span>
            </button>
            <button className="util-btn" title={t("common.help")} aria-label={t("common.help")} onClick={() => setHelpOpen(true)}>
              <span className="material-symbols-outlined">help</span>
            </button>
          </div>
        </header>
        <div className="manager-view-body">
          <Outlet />
        </div>
      </main>

      <ProfileDrawer
        open={accountOpen}
        onClose={() => setAccountOpen(false)}
        currentUser={currentUser}
        setCurrentUser={setCurrentUser}
        roleLabel={t("layout.clanManager")}
        title={t("common.editProfile")}
      />
      <HelpDialog open={helpOpen} onClose={() => setHelpOpen(false)} />
      <AIChatGateway />
    </div>
  );
}

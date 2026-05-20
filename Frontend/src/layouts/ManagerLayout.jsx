import { useCallback, useEffect, useState } from "react";
import { Link, Outlet, useLocation, Navigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { getStoredUser, logout, isAuthenticated } from "../shared/utils/auth";
import { formatDate } from "../shared/utils/dateFormat";
import { apiRequest } from "../services/api";
import { connectSocketFromStorage } from "../services/socket";
import { resolveImageUrl } from "../shared/utils/media";
import NotificationBell from "./NotificationBell";
import LanguageToggle from "../shared/components/LanguageToggle";
import ProfileDrawer from "../shared/components/ProfileDrawer";
import "./ManagerLayout.css";

const menuItems = [
  { icon: "dashboard", labelKey: "layout.portalMenu.overview", path: "/manager/dashboard" },
  { icon: "account_tree", labelKey: "layout.portalMenu.genealogy", path: "/manager/genealogy" },
  { icon: "assignment", labelKey: "layout.portalMenu.events", path: "/manager/tasks" },
  { icon: "post_add", labelKey: "layout.portalMenu.posts", path: "/manager/posts" },
  { icon: "collections_bookmark", labelKey: "layout.portalMenu.memories", path: "/manager/time-capsule" },
  { icon: "group", labelKey: "layout.portalMenu.members", path: "/manager/account" },
  { icon: "pending_actions", labelKey: "layout.portalMenu.pending", path: "/manager/pending" },
  { icon: "account_balance_wallet", labelKey: "layout.portalMenu.fund", path: "/manager/fund" },
  { icon: "calendar_month", labelKey: "layout.portalMenu.calendar", path: "/manager/calendar" },
  { icon: "payments", labelKey: "layout.portalMenu.billing", path: "/manager/billing" },
];

export default function ManagerLayout() {
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const [currentUser, setCurrentUser] = useState(() => getStoredUser());
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [accountOpen, setAccountOpen] = useState(false);
  const [accountLoading, setAccountLoading] = useState(false);
  const [accountSaving, setAccountSaving] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [accountMessage, setAccountMessage] = useState("");
  const [accountForm, setAccountForm] = useState({
    email: "",
    surname: "",
    middle_name: "",
    first_name: "",
    hometown: "",
    generation: "",
    bio: "",
    avatar_url: "",
    avatar_media_id: null,
    moderation_status: "none",
    person_id: null,
  });
  const [passwordForm, setPasswordForm] = useState({
    current_password: "",
    new_password: "",
    confirm_password: "",
  });

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

  if (!isAuthenticated()) {
    return <Navigate to="/" replace />;
  }

  const handleLogout = () => {
    logout();
    window.location.href = "/";
  };

  const syncStoredUser = (profile) => {
    if (!profile) return;
    const storedUser = getStoredUser() || {};
    const profileName = profile.display_name || [profile.surname, profile.middle_name, profile.first_name].filter(Boolean).join(" ").trim();
    const nextUser = {
      ...storedUser,
      email: profile.email || storedUser.email,
      display_name: profile.display_name || storedUser.display_name,
      name: profileName || storedUser.name,
      role_id: profile.role_id || storedUser.role_id,
      status: profile.status || storedUser.status,
      avatar_url: resolveImageUrl({
        mediaId: profile.pending_avatar_media_id || profile.avatar_media_id,
        avatar_url: profile.pending_avatar_url || profile.avatar_url || storedUser.avatar_url || currentUser?.avatar_url || "",
      }),
      avatar_media_id: profile.pending_avatar_media_id || profile.avatar_media_id || storedUser.avatar_media_id || currentUser?.avatar_media_id || null,
    };
    localStorage.setItem("auth_user", JSON.stringify(nextUser));
    localStorage.setItem("user", JSON.stringify(nextUser));
    setCurrentUser(nextUser);
  };

  const loadAccountProfile = useCallback(async () => {
    setAccountLoading(true);
    setAccountMessage("");
    try {
      const data = await apiRequest("/api/member/dashboard");
      const profile = data.profile || {};
      setAccountForm({
        email: profile.email || "",
        surname: profile.surname || "",
        middle_name: profile.middle_name || "",
        first_name: profile.first_name || "",
        hometown: profile.hometown || "",
        generation: profile.generation ?? "",
        bio: profile.pending_bio !== null && profile.pending_bio !== undefined ? profile.pending_bio || "" : profile.bio || "",
        avatar_url:
          profile.pending_avatar_url !== null && profile.pending_avatar_url !== undefined
            ? resolveImageUrl({ mediaId: profile.pending_avatar_media_id, avatar_url: profile.pending_avatar_url || "" })
            : resolveImageUrl({ mediaId: profile.avatar_media_id, avatar_url: profile.avatar_url || "" }),
        avatar_media_id:
          profile.pending_avatar_media_id !== null && profile.pending_avatar_media_id !== undefined
            ? profile.pending_avatar_media_id || null
            : profile.avatar_media_id || null,
        moderation_status: profile.moderation_status || "none",
        person_id: profile.person_id ?? null,
      });
      syncStoredUser(profile);
    } catch (error) {
      setAccountMessage(error?.message || t("layout.accountMessages.loadFailed"));
    } finally {
      setAccountLoading(false);
    }
  }, []);

  const openAccountModal = () => {
    setAccountOpen(true);
  };

  const updateAccountField = (event) => {
    const { name, value } = event.target;
    setAccountForm((prev) => ({ ...prev, [name]: value }));
  };

  const updatePasswordField = (event) => {
    const { name, value } = event.target;
    setPasswordForm((prev) => ({ ...prev, [name]: value }));
  };

  const saveAccountInfo = async () => {
    setAccountMessage("");
    if (accountForm.person_id == null) {
      setAccountMessage(t("layout.accountMessages.notLinked"));
      return;
    }

    const generationText = String(accountForm.generation || "").trim();
    const generation = generationText === "" ? null : Number(generationText);
    if (generationText && !Number.isFinite(generation)) {
      setAccountMessage(t("layout.accountMessages.invalidGeneration"));
      return;
    }

    setAccountSaving(true);
    try {
      const data = await apiRequest("/api/member/profile", {
        method: "PUT",
        body: JSON.stringify({
          email: accountForm.email,
          surname: accountForm.surname,
          middle_name: accountForm.middle_name,
          first_name: accountForm.first_name,
          hometown: accountForm.hometown,
          generation,
        }),
      });
      syncStoredUser(data.profile);
      setAccountMessage(t("layout.accountMessages.updated"));
      await loadAccountProfile();
    } catch (error) {
      setAccountMessage(error?.message || t("layout.accountMessages.saveFailed"));
    } finally {
      setAccountSaving(false);
    }
  };

  const submitProfileContent = async () => {
    setAccountMessage("");
    if (accountForm.person_id == null) {
      setAccountMessage(t("layout.accountMessages.notLinkedContent"));
      return;
    }

    setAccountSaving(true);
    try {
      await apiRequest("/api/member/content/profile", {
        method: "POST",
        body: JSON.stringify({
          bio: accountForm.bio,
          avatar_url: accountForm.avatar_url,
          avatar_media_id: accountForm.avatar_media_id || null,
        }),
      });
      setAccountMessage(t("layout.accountMessages.contentSubmitted"));
      await loadAccountProfile();
    } catch (error) {
      setAccountMessage(error?.message || t("layout.accountMessages.contentSubmitFailed"));
    } finally {
      setAccountSaving(false);
    }
  };

  const savePassword = async () => {
    setAccountMessage("");
    if (passwordForm.new_password !== passwordForm.confirm_password) {
      setAccountMessage(t("auth.forgotPassword.passwordMismatch"));
      return;
    }

    setPasswordSaving(true);
    try {
      await apiRequest("/api/member/password", {
        method: "PUT",
        body: JSON.stringify({
          current_password: passwordForm.current_password,
          new_password: passwordForm.new_password,
        }),
      });
      setPasswordForm({ current_password: "", new_password: "", confirm_password: "" });
      setAccountMessage(t("layout.accountMessages.passwordChanged"));
    } catch (error) {
      setAccountMessage(error?.message || t("layout.accountMessages.passwordChangeFailed"));
    } finally {
      setPasswordSaving(false);
    }
  };

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
            <img src={sidebarOpen ? "/gia-pha-full-logo.png" : "/gia-pha-g-logo.png"} alt={t("layout.brand")} />
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

      <main className="manager-main-content">
        <header className="manager-top-header glass-effect">
          <div className="header-context">
            <h1>{t("layout.managerTitle")}</h1>
            <p>{t("layout.session", { date: formatDate(new Date(), { language: i18n.language }) })}</p>
          </div>
          <div className="header-utils">
            <NotificationBell role="manager" buttonClassName="util-btn" />
            <LanguageToggle className="util-btn" />
            <button className="util-btn" title={t("layout.editAccount")} onClick={openAccountModal}>
              <span className="material-symbols-outlined">account_circle</span>
            </button>
            <button className="util-btn" title={t("common.help")}>
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
    </div>
  );
}

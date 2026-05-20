import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import LanguageToggle from "../shared/components/LanguageToggle";
import "./Header.css";

const navItems = [
  { labelKey: "layout.about", to: "/#ve-chung-toi" },
  { labelKey: "layout.features", to: "/tinh-nang" },
  { labelKey: "layout.benefits", to: "/loi-ich" },
  { labelKey: "layout.news", to: "/tin-tuc" },
  { labelKey: "layout.guide", to: "/huong-dan" },
];

export default function Header({
  isLoggedIn,
  currentUsername,
  currentUser,
  onLogout,
  onOpenLogin,
  onOpenRegister,
}) {
  const { t } = useTranslation();

  const getDashboardPath = () => {
    if (!currentUser) return "/";
    if (currentUser.role_name === "admin") return "/dashboard";
    if (currentUser.role_name === "manager") return "/manager/dashboard";
    if (currentUser.role_name === "member") return "/user/dashboard";
    return "/";
  };

  return (
    <header className="site-header">
      <div className="header-top">
        <div className="brand">
          <Link to="/" aria-label={t("layout.homeAria")}>
            <img
              src="/logo-giaphaviet.png"
              alt={t("layout.brand")}
              className="brand-logo"
            />
          </Link>
        </div>
      </div>

      <nav className="main-nav">
        <div className="main-nav-links">
          {navItems.map((item) => (
            <Link key={item.labelKey} to={item.to}>
              {t(item.labelKey)}
            </Link>
          ))}
        </div>

        <div className="main-nav-auth">
          <LanguageToggle className="nav-language-toggle" showIcon={false} />
          {isLoggedIn ? (
            <>
              <Link to={getDashboardPath()} className="nav-dashboard-link">
                <span className="material-symbols-outlined">dashboard</span>
                {t("common.dashboard")}
              </Link>
              <span className="auth-user">{t("layout.hello", { name: currentUsername })}</span>
              <button
                type="button"
                onClick={onLogout}
                className="nav-btn nav-btn-logout"
              >
                {t("common.logout")}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="nav-btn nav-btn-register"
                onClick={onOpenRegister}
              >
                {t("common.register")}
              </button>
              <button
                type="button"
                className="nav-btn nav-btn-login"
                onClick={onOpenLogin}
              >
                {t("common.login")}
              </button>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}

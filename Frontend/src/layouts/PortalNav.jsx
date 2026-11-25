import { useEffect } from "react";
import { NavLink } from "react-router-dom";
import { useTranslation } from "react-i18next";
import "./PortalNav.css";

// Cùng mốc với useResponsiveSidebar: dưới mốc này thanh bên là ngăn kéo phủ lên trang.
const DRAWER_QUERY = "(max-width: 1100px)";
const isDrawerMode = () => typeof window !== "undefined" && window.matchMedia(DRAWER_QUERY).matches;

// Menu chung của ba layout: nhóm có tiêu đề, mục đang chọn có aria-current="page" (NavLink tự gắn).
// Ở chế độ ngăn kéo: chọn một mục hoặc bấm Esc thì đóng ngăn kéo (setOpen là setter của useResponsiveSidebar).
export default function PortalNav({ groups, label, open, setOpen }) {
  const { t } = useTranslation();

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape" && isDrawerMode()) setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, setOpen]);

  const closeDrawer = () => {
    if (isDrawerMode()) setOpen(false);
  };

  return (
    <nav className="portal-nav" aria-label={label}>
      {groups.map((group, index) => {
        const headingId = group.labelKey ? `portal-nav-${group.labelKey.split(".").pop()}` : undefined;
        return (
          <div className="portal-nav-group" key={group.labelKey || `group-${index}`}>
            {group.labelKey ? <p className="portal-nav-heading" id={headingId}>{t(group.labelKey)}</p> : null}
            <ul aria-labelledby={headingId}>
              {group.items.map((item) => (
                <li key={item.path}>
                  <NavLink
                    to={item.path}
                    end={item.end}
                    className={({ isActive }) => `portal-nav-link${isActive ? " is-active" : ""}`}
                    title={open ? undefined : t(item.labelKey)}
                    onClick={closeDrawer}
                  >
                    <span className="material-symbols-outlined" aria-hidden="true">{item.icon}</span>
                    <span className="portal-nav-label">{t(item.labelKey)}</span>
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}

// Nút mở menu trên màn hẹp: nằm ở góc dưới bên trái cho ngón cái (CSS ở PortalNav.css), có chữ "Menu" cạnh biểu tượng.
export function PortalMenuButton({ className = "", onOpen }) {
  const { t } = useTranslation();
  return (
    <button type="button" className={`${className} mobile-sidebar-open portal-menu-button`} onClick={onOpen} aria-label={t("layout.openMenu")}>
      <span className="material-symbols-outlined" aria-hidden="true">menu</span>
      <span className="portal-menu-button-label">{t("layout.nav.menuButton")}</span>
    </button>
  );
}

import { useEffect, useState, useCallback } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import Header from "./Header";
import SiteFooter from "./SiteFooter";
import Login from "../features/auth/pages/Login";
import Register from "../features/auth/pages/Register";
import { getCurrentUser, logout } from "../shared/utils/auth";

export default function UserLayout() {
  const { t } = useTranslation();
  const [authMode, setAuthMode] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const navigate = useNavigate();
  const location = useLocation();

  const handleRedirection = useCallback((user) => {
    if (!user) return;

    if (user.status === "pending") {
      navigate("/waiting", { replace: true });
      return;
    }
    
    // Redirect logic based on role_name
    if (user.role_name === "admin") {
      navigate("/dashboard", { replace: true });
    } else if (user.role_name === "manager") {
      navigate("/manager/account", { replace: true });
    } else if (user.role_name === "member") {
      // For members, we can redirect to family-tree if they are on the home page
      if (location.pathname === "/") {
        navigate("/user/family-tree", { replace: true });
      }
    }
  }, [navigate, location.pathname]);

  useEffect(() => {
    const user = getCurrentUser();
    if (user) {
      setCurrentUser(user);
      // If user is already logged in and hits the landing page ("/"), redirect them
      if (location.pathname === "/") {
        handleRedirection(user);
      }
    }
  }, [location.pathname, handleRedirection]);

  const isLoggedIn = !!currentUser;

  const handleLogout = () => {
    logout();
    setCurrentUser(null);
    navigate("/", { replace: true });
  };

  const handleLoginSuccess = (user) => {
    const loggedInUser = user || getCurrentUser();
    setCurrentUser(loggedInUser);
    handleRedirection(loggedInUser);
  };

  const closeAuth = () => {
    setAuthMode(null);
  };

  const openLogin = () => {
    setAuthMode("login");
  };

  const openRegister = () => {
    setAuthMode("register");
  };

  return (
    <>
      <Header
        isLoggedIn={isLoggedIn}
        currentUsername={currentUser?.name || currentUser?.display_name || currentUser?.email || t("layout.userFallback")}
        currentUser={currentUser}
        onLogout={handleLogout}
        onOpenLogin={openLogin}
        onOpenRegister={openRegister}
      />

      <Outlet />

      <SiteFooter />

      <Login
        isOpen={authMode === "login"}
        onClose={closeAuth}
        onLoginSuccess={handleLoginSuccess}
        onOpenRegister={openRegister}
      />

      <Register
        isOpen={authMode === "register"}
        onClose={closeAuth}
        onLoginClick={openLogin}
      />
    </>
  );
}

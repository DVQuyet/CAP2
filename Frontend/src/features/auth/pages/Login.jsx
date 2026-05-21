import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import "./login.css";
import { loginAPI } from "../../../api/authService";
import { persistAuthSession } from "../../../shared/utils/auth";

const initialLoginForm = {
  email: "",
  password: "",
};

function getRolePath(user) {
  const roleId = Number(user?.role_id);
  const roleName = user?.role_name || user?.role;

  if (roleId === 1 || roleName === "admin") return "/dashboard";
  if (roleId === 2 || roleName === "manager") return "/manager/dashboard";
  return "/user/dashboard";
}

export default function Login({ isOpen, onClose, onLoginSuccess, onOpenRegister }) {
  const { t } = useTranslation();
  const isModal = typeof isOpen === "boolean";
  const navigate = useNavigate();
  const [loginForm, setLoginForm] = useState(initialLoginForm);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isModal) return;
    if (!isOpen) return;
    setError("");
    setSuccessMessage("");
  }, [isModal, isOpen]);

  useEffect(() => {
    if (!isModal || !isOpen) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose?.();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isModal, isOpen, onClose]);

  if (isModal && !isOpen) return null;

  const handleLoginChange = (event) => {
    const { name, value } = event.target;
    setLoginForm((current) => ({ ...current, [name]: value }));
    if (error) setError("");
  };

  const handleLoginSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setSuccessMessage("");
    setIsSubmitting(true);

    try {
      const email = loginForm.email.trim();
      if (!email) {
        setError(t("auth.login.missingEmail"));
        return;
      }

      const result = await loginAPI({ email, password: loginForm.password });
      if (!result?.success) {
        setError(result?.message || t("auth.login.failed"));
        return;
      }
      if (!result.user) {
        setError(t("auth.login.missingUser"));
        return;
      }

      persistAuthSession(result);
      onLoginSuccess?.(result.user);
      setLoginForm(initialLoginForm);

      if (isModal) {
        onClose?.();
        return;
      }

      if (result.user.status === "pending") {
        navigate("/waiting", { replace: true });
        return;
      }

      if (Number(result.user.profile_completed) === 0) {
        navigate("/complete-profile", { replace: true });
        return;
      }

      navigate(getRolePath(result.user), { replace: true });
    } catch (submitError) {
      setError(submitError?.message || String(submitError));
    } finally {
      setIsSubmitting(false);
    }
  };

  const loginFields = (
    <form onSubmit={handleLoginSubmit} className={isModal ? "auth-login-form" : undefined}>
      <div className="input-field">
        <input
          name="email"
          type="email"
          placeholder={t("auth.login.emailPlaceholder")}
          value={loginForm.email}
          required
          autoComplete="username"
          onChange={handleLoginChange}
        />
      </div>

      <div className="input-field">
        <input
          name="password"
          type="password"
          placeholder={t("auth.login.passwordPlaceholder")}
          value={loginForm.password}
          required
          autoComplete="current-password"
          onChange={handleLoginChange}
        />
      </div>

      <button type="submit" className="btn-login" disabled={isSubmitting}>
        {isSubmitting ? t("auth.login.submitting") : t("auth.login.submit")}
      </button>
    </form>
  );

  if (!isModal) {
    return (
      <div className="login-page" data-no-translate="true">
        <Link to="/" className="back-btn">← {t("navigation.backHome")}</Link>
        <div className="login-box">
          <div className="login-header">
            <h2>{t("auth.login.title")}</h2>
            <p>{t("auth.login.subtitle")}</p>
          </div>

          {error && <div className="error-alert">{error}</div>}
          {successMessage && !error && <div className="success-alert">{successMessage}</div>}

          {loginFields}

          <div className="login-footer">
            <p>
              <span>{t("auth.login.noAccount")} <Link to="/register">{t("navigation.register")}</Link></span>
              <span>
                <Link to="/forgot" title={t("auth.login.forgotTitle")}>
                  {t("auth.login.forgotPassword")}
                </Link>
              </span>
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-modal-overlay" onClick={onClose} data-no-translate="true">
      <div className="auth-modal-card auth-modal-card--login" onClick={(event) => event.stopPropagation()}>
        <button className="auth-modal-close" onClick={onClose} type="button" aria-label={t("auth.close")}>
          ×
        </button>

        <section className="auth-panel auth-panel--login">
          <div className="auth-modal-header">
            <h2>{t("auth.login.title")}</h2>
            <p>{t("auth.login.subtitle")}</p>
          </div>

          {error && <div className="auth-error">{error}</div>}
          {successMessage && !error && <div className="auth-success">{successMessage}</div>}

          {loginFields}

          <div className="auth-modal-footer auth-modal-footer--between">
            <span>
              {t("auth.login.noAccount")}{" "}
              <button
                className="auth-link-btn"
                type="button"
                onClick={() => {
                  onClose?.();
                  onOpenRegister?.();
                }}
              >
                {t("navigation.register")}
              </button>
            </span>
            <Link className="auth-link-btn" to="/forgot" onClick={onClose}>
              {t("auth.login.forgotPassword")}
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}

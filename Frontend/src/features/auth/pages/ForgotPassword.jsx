import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import "./login.css";
import { requestPasswordResetAPI, resetPasswordWithCodeAPI } from "../../../api/authService";

const ForgotPassword = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [step, setStep] = useState(1);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSendCode = async (e) => {
    e.preventDefault();
    setError("");
    setInfo("");
    setLoading(true);
    try {
      const res = await requestPasswordResetAPI(email.trim());
      if (res?.success) {
        setInfo(res.message || t("auth.forgotPassword.processed"));
        setStep(2);
      }
    } catch (err) {
      setError(err.message || t("auth.forgotPassword.sendFailed"));
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async (e) => {
    e.preventDefault();
    setError("");
    setInfo("");
    if (newPassword !== confirmPassword) {
      setError(t("auth.forgotPassword.passwordMismatch"));
      return;
    }
    if (newPassword.length < 6) {
      setError(t("auth.forgotPassword.passwordMin"));
      return;
    }
    setLoading(true);
    try {
      const res = await resetPasswordWithCodeAPI({
        email: email.trim(),
        code: code.trim(),
        new_password: newPassword,
      });
      if (res?.success) {
        setInfo(res.message || t("auth.forgotPassword.resetSuccess"));
        setTimeout(() => navigate("/login", { replace: true }), 1200);
      }
    } catch (err) {
      setError(err.message || t("auth.forgotPassword.resetFailed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page" data-no-translate="true">
      <Link to="/login" className="back-btn">
        ← {t("navigation.login")}
      </Link>
      <div className="login-box">
        <div className="login-header">
          <h2>{t("auth.forgotPassword.title")}</h2>
          <p>
            {step === 1
              ? t("auth.forgotPassword.stepEmail")
              : t("auth.forgotPassword.stepReset")}
          </p>
        </div>

        {step === 1 && (
          <div className="forgot-hint">
            {t("auth.forgotPassword.hint")}
          </div>
        )}

        {error && <div className="error-alert">{error}</div>}
        {info && !error && (
          <div
            style={{
              marginBottom: 14,
              padding: "10px 12px",
              border: "1px solid #86efac",
              color: "#166534",
              borderRadius: 8,
              background: "#f0fdf4",
              fontSize: 14,
            }}
          >
            {info}
          </div>
        )}

        {step === 1 && (
          <form onSubmit={handleSendCode}>
            <div className="input-field">
              <input
                type="email"
                placeholder={t("auth.forgotPassword.registeredEmail")}
                value={email}
                required
                autoComplete="email"
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <button type="submit" className="btn-login" disabled={loading}>
              {loading ? t("auth.forgotPassword.sending") : t("auth.forgotPassword.sendCode")}
            </button>
          </form>
        )}

        {step === 2 && (
          <form onSubmit={handleReset}>
            <div className="input-field">
              <input type="email" value={email} disabled readOnly />
            </div>
            <div className="input-field">
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                placeholder={t("auth.forgotPassword.code")}
                value={code}
                required
                autoComplete="one-time-code"
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              />
            </div>
            <div className="input-field">
              <input
                type="password"
                placeholder={t("auth.forgotPassword.newPassword")}
                value={newPassword}
                required
                minLength={6}
                autoComplete="new-password"
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>
            <div className="input-field">
              <input
                type="password"
                placeholder={t("auth.forgotPassword.confirmPassword")}
                value={confirmPassword}
                required
                minLength={6}
                autoComplete="new-password"
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
            <button type="submit" className="btn-login" disabled={loading}>
              {loading ? t("auth.forgotPassword.resetting") : t("auth.forgotPassword.reset")}
            </button>
            <button
              type="button"
              className="btn-login btn-login-secondary"
              disabled={loading}
              onClick={() => {
                setStep(1);
                setCode("");
                setNewPassword("");
                setConfirmPassword("");
                setError("");
                setInfo("");
              }}
            >
              {t("auth.forgotPassword.resend")}
            </button>
          </form>
        )}

        <div className="login-footer">
          <p>
            <span>
              <Link to="/login">← {t("auth.forgotPassword.backToLogin")}</Link>
            </span>
          </p>
        </div>
      </div>
    </div>
  );
};

export default ForgotPassword;

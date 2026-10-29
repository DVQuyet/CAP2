import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { exchangeOAuthCodeAPI, fetchMeAPI } from "../../../api/authService";
import { ensureMediaToken } from "../../../services/mediaToken";
import { persistAuthSession } from "../../../shared/utils/auth";
import "./login.css";

function getRolePath(user) {
  const roleId = Number(user?.role_id);
  const roleName = user?.role_name || user?.role;

  if (roleId === 1 || roleName === "admin") return "/dashboard";
  if (roleId === 2 || roleName === "manager") return "/manager/dashboard";
  return "/user/dashboard";
}

// Mã chỉ dùng được một lần: StrictMode (dev) chạy effect hai lần, nên dùng chung một lời gọi đổi mã cho cùng một mã.
const codeExchanges = new Map();
function exchangeCodeOnce(code) {
  if (!codeExchanges.has(code)) codeExchanges.set(code, exchangeOAuthCodeAPI(code));
  return codeExchanges.get(code);
}

export default function AuthCallback() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function completeLogin() {
      const callbackError = searchParams.get("error");
      const message = searchParams.get("message");
      const code = searchParams.get("code");
      // `token` là cách cũ (JWT trên URL): vẫn nhận để bản backend cũ chưa deploy không làm vỡ đăng nhập; bỏ sau một đợt deploy.
      let token = searchParams.get("token");
      const mode = searchParams.get("mode");
      const socialToken = searchParams.get("social_token");

      if (mode === "register" && socialToken) {
        navigate(`/register?social_token=${encodeURIComponent(socialToken)}`, { replace: true });
        return;
      }

      if (callbackError === "ACCOUNT_BLOCKED" || callbackError === "ACCOUNT_ARCHIVED" || callbackError === "account_disabled") {
        navigate("/account-disabled", {
          replace: true,
          state: { message: message || t("auth.callback.accountDisabled") },
        });
        return;
      }

      if (!callbackError && !token && code) {
        try {
          token = await exchangeCodeOnce(code);
        } catch (err) {
          if (!cancelled) setError(err?.message || t("auth.callback.socialLoginFailed"));
          return;
        }
        if (cancelled) return;
      }

      if (callbackError || !token) {
        setError(message || t("auth.callback.socialLoginFailed"));
        return;
      }

      try {
        const result = await fetchMeAPI(token);
        const user = result?.user;
        if (!user) throw new Error(t("auth.callback.noAccountInfo"));

        persistAuthSession({ token, user });
        await ensureMediaToken();
        if (cancelled) return;

        if (user.auth_status === "pending" || user.status === "pending") {
          navigate("/waiting", { replace: true });
          return;
        }

        if (Number(user.profile_completed) === 0) {
          navigate("/complete-profile", { replace: true });
          return;
        }

        navigate(getRolePath(user), { replace: true });
      } catch (err) {
        if (!cancelled) setError(err?.message || t("auth.callback.socialLoginFailed"));
      }
    }

    completeLogin();
    return () => {
      cancelled = true;
    };
  }, [navigate, searchParams, t]);

  return (
    <div className="login-page" data-no-translate="true">
      <Link to="/" className="back-btn">← {t("navigation.backHome")}</Link>
      <div className="login-box">
        <div className="login-header">
          <h2>{t("auth.callback.title")}</h2>
          <p>{t("auth.callback.completing")}</p>
        </div>

        {error ? (
          <>
            <div className="error-alert">{error}</div>
            <Link className="auth-callback-link" to="/login">{t("auth.callback.backToLogin")}</Link>
          </>
        ) : (
          <div className="success-alert">{t("auth.callback.verifying")}</div>
        )}
      </div>
    </div>
  );
}

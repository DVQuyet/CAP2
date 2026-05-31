import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { fetchMeAPI } from "../../../api/authService";
import { persistAuthSession } from "../../../shared/utils/auth";
import "./login.css";

function getRolePath(user) {
  const roleId = Number(user?.role_id);
  const roleName = user?.role_name || user?.role;

  if (roleId === 1 || roleName === "admin") return "/dashboard";
  if (roleId === 2 || roleName === "manager") return "/manager/dashboard";
  return "/user/dashboard";
}

export default function AuthCallback() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function completeLogin() {
      const callbackError = searchParams.get("error");
      const message = searchParams.get("message");
      const token = searchParams.get("token");
      const mode = searchParams.get("mode");
      const socialToken = searchParams.get("social_token");

      if (mode === "register" && socialToken) {
        navigate(`/register?social_token=${encodeURIComponent(socialToken)}`, { replace: true });
        return;
      }

      if (callbackError === "ACCOUNT_BLOCKED" || callbackError === "ACCOUNT_ARCHIVED" || callbackError === "account_disabled") {
        navigate("/account-disabled", {
          replace: true,
          state: { message: message || "Tai khoan cua ban dang bi vo hieu hoa." },
        });
        return;
      }

      if (callbackError || !token) {
        setError(message || "Đăng nhập mạng xã hội không thành công.");
        return;
      }

      try {
        const result = await fetchMeAPI(token);
        const user = result?.user;
        if (!user) throw new Error("Không lấy được thông tin tài khoản.");

        persistAuthSession({ token, user });
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
        if (!cancelled) setError(err?.message || "Đăng nhập mạng xã hội không thành công.");
      }
    }

    completeLogin();
    return () => {
      cancelled = true;
    };
  }, [navigate, searchParams]);

  return (
    <div className="login-page" data-no-translate="true">
      <Link to="/" className="back-btn">{"<-"} Về trang chủ</Link>
      <div className="login-box">
        <div className="login-header">
          <h2>Đăng nhập</h2>
          <p>Đang hoàn tất phiên đăng nhập mạng xã hội...</p>
        </div>

        {error ? (
          <>
            <div className="error-alert">{error}</div>
            <Link className="auth-callback-link" to="/login">Quay lại đăng nhập</Link>
          </>
        ) : (
          <div className="success-alert">Đang xác minh tài khoản...</div>
        )}
      </div>
    </div>
  );
}

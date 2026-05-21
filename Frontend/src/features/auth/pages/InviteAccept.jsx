import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { acceptInvitation, verifyInvitation } from "../../../api/invitationService";
import { persistAuthSession } from "../../../shared/utils/auth";
import "./invite.css";

const initialForm = {
  password: "",
  confirm_password: "",
};

export default function InviteAccept() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("token") || "";
  const [state, setState] = useState({ loading: true, error: "", invitation: null });
  const [form, setForm] = useState(initialForm);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadInvite() {
      if (!token) {
        setState({ loading: false, error: "Liên kết lời mời thiếu token.", invitation: null });
        return;
      }

      setState({ loading: true, error: "", invitation: null });
      try {
        const data = await verifyInvitation(token);
        if (!cancelled) setState({ loading: false, error: "", invitation: data });
      } catch (error) {
        if (!cancelled) {
          setState({
            loading: false,
            error: error?.message || "Lời mời không hợp lệ hoặc đã hết hạn.",
            invitation: null,
          });
        }
      }
    }

    loadInvite();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const updateField = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setState((current) => ({ ...current, error: "" }));

    if (form.password.length < 6) {
      setState((current) => ({ ...current, error: "Mật khẩu tối thiểu 6 ký tự." }));
      return;
    }
    if (form.password !== form.confirm_password) {
      setState((current) => ({ ...current, error: "Mật khẩu xác nhận không khớp." }));
      return;
    }

    setSubmitting(true);
    try {
      const result = await acceptInvitation({
        token,
        password: form.password,
        confirm_password: form.confirm_password,
      });
      persistAuthSession(result);
      navigate(result.next || "/complete-profile", { replace: true });
    } catch (error) {
      setState((current) => ({
        ...current,
        error: error?.message || "Không thể chấp nhận lời mời.",
      }));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="invite-auth-page">
      <Link to="/" className="invite-back-link">← Về trang chủ</Link>

      <section className="invite-auth-panel">
        <div className="invite-auth-header">
          <span className="material-symbols-outlined">mail_lock</span>
          <h1>Chấp nhận lời mời</h1>
          <p>Tạo mật khẩu cho tài khoản được mời vào CAP2/Gia phả Việt.</p>
        </div>

        {state.loading ? <div className="invite-alert">Đang kiểm tra lời mời...</div> : null}
        {state.error ? <div className="invite-alert is-error">{state.error}</div> : null}

        {!state.loading && state.invitation ? (
          <form className="invite-form" onSubmit={handleSubmit}>
            <label>
              Email được mời
              <input value={state.invitation.email || ""} readOnly />
            </label>

            {state.invitation.generation ? (
              <label>
                Đời gia phả
                <input value={`Đời ${state.invitation.generation}`} readOnly />
              </label>
            ) : null}

            <label>
              Mật khẩu
              <input
                name="password"
                type="password"
                value={form.password}
                onChange={updateField}
                minLength={6}
                autoComplete="new-password"
                required
              />
            </label>

            <label>
              Xác nhận mật khẩu
              <input
                name="confirm_password"
                type="password"
                value={form.confirm_password}
                onChange={updateField}
                minLength={6}
                autoComplete="new-password"
                required
              />
            </label>

            <button type="submit" disabled={submitting}>
              <span className="material-symbols-outlined">{submitting ? "progress_activity" : "check_circle"}</span>
              {submitting ? "Đang tạo tài khoản..." : "Tạo mật khẩu"}
            </button>
          </form>
        ) : null}
      </section>
    </main>
  );
}

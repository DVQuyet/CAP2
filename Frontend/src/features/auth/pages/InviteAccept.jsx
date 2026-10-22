import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { acceptInvitation, verifyInvitation } from "../../../api/invitationService";
import { persistAuthSession } from "../../../shared/utils/auth";
import "./invite.css";

const initialForm = {
  password: "",
  confirm_password: "",
};

export default function InviteAccept() {
  const { t } = useTranslation();
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
        setState({ loading: false, error: t("auth.invite.missingToken"), invitation: null });
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
            error: error?.message || t("auth.invite.invalid"),
            invitation: null,
          });
        }
      }
    }

    loadInvite();
    return () => {
      cancelled = true;
    };
  }, [token, t]);

  const updateField = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setState((current) => ({ ...current, error: "" }));

    if (form.password.length < 6) {
      setState((current) => ({ ...current, error: t("auth.invite.passwordTooShort") }));
      return;
    }
    if (form.password !== form.confirm_password) {
      setState((current) => ({ ...current, error: t("auth.invite.passwordMismatch") }));
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
        error: error?.message || t("auth.invite.acceptFailed"),
      }));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="invite-auth-page">
      <Link to="/" className="invite-back-link">← {t("navigation.backHome")}</Link>

      <section className="invite-auth-panel">
        <div className="invite-auth-header">
          <span className="material-symbols-outlined">mail_lock</span>
          <h1>{t("auth.invite.title")}</h1>
          <p>{t("auth.invite.subtitle")}</p>
        </div>

        {state.loading ? <div className="invite-alert">{t("auth.invite.checking")}</div> : null}
        {state.error ? <div className="invite-alert is-error">{state.error}</div> : null}

        {!state.loading && state.invitation ? (
          <form className="invite-form" onSubmit={handleSubmit}>
            <label>
              {t("auth.invite.email")}
              <input value={state.invitation.email || ""} readOnly />
            </label>

            {state.invitation.generation ? (
              <label>
                {t("auth.completeProfile.generationLabel")}
                <input value={t("auth.completeProfile.generationValue", { generation: state.invitation.generation })} readOnly />
              </label>
            ) : null}

            <label>
              {t("auth.invite.password")}
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
              {t("auth.invite.confirmPassword")}
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
              {submitting ? t("auth.invite.creating") : t("auth.invite.createPassword")}
            </button>
          </form>
        ) : null}
      </section>
    </main>
  );
}

import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiRequest } from "../../../services/api";
import { createInvitation, listInvitations } from "../../../api/invitationService";
import { getStoredUser } from "../../../shared/utils/auth";
import "../../auth/pages/invite.css";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const initialForm = {
  email: "",
  role: "member",
  clan_id: "",
  generation: "1",
};

function statusLabel(status, t) {
  if (status === "accepted") return t("invitation.status.accepted");
  if (status === "expired") return t("invitation.status.expired");
  if (status === "revoked") return t("invitation.status.revoked");
  return t("invitation.status.pending");
}

function roleLabel(role, t) {
  if (role === "member" || role === "manager") return t(`invitation.role.${role}`);
  return role;
}

export default function InvitationPage() {
  const { t, i18n } = useTranslation();
  const currentUser = getStoredUser();
  const isAdmin = Number(currentUser?.role_id) === 1 || currentUser?.role_name === "admin";
  const [form, setForm] = useState(initialForm);
  const [clans, setClans] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [inviteLink, setInviteLink] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);

  const sortedInvitations = useMemo(() => invitations || [], [invitations]);

  const loadInvitations = async () => {
    setLoading(true);
    try {
      const data = await listInvitations();
      setInvitations(data.invitations || []);
    } catch (loadError) {
      setError(loadError?.message || t("invitation.loadError"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInvitations();

    if (isAdmin) {
      apiRequest("/api/admin/clans")
        .then((data) => setClans(data.clans || data.data || []))
        .catch(() => setClans([]));
    }
  }, [isAdmin]);

  const updateField = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
    setMessage("");
    setError("");
    setInviteLink("");
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setMessage("");
    setError("");
    setInviteLink("");

    if (!form.email.trim()) {
      setError(t("invitation.emailRequired"));
      return;
    }
    // Tự kiểm tra (form có noValidate) để thông báo luôn bằng tiếng Việt, không phụ thuộc ngôn ngữ trình duyệt.
    if (!EMAIL_PATTERN.test(form.email.trim())) {
      setError(t("invitation.emailInvalid"));
      return;
    }
    if (isAdmin && !form.clan_id) {
      setError(t("invitation.clanRequired"));
      return;
    }

    const generation = Number(form.generation);
    if (!Number.isInteger(generation) || generation <= 0) {
      setError(t("invitation.generationInvalid"));
      return;
    }

    setSending(true);
    try {
      const payload = {
        email: form.email.trim(),
        role: isAdmin ? form.role : "member",
        generation,
        ...(isAdmin ? { clan_id: Number(form.clan_id) } : {}),
      };
      const result = await createInvitation(payload);
      setMessage(result.message || t("invitation.created"));
      setInviteLink(result.invite_link || "");
      setForm((current) => ({ ...initialForm, clan_id: current.clan_id }));
      await loadInvitations();
    } catch (submitError) {
      setError(submitError?.message || t("invitation.sendError"));
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="invite-management-page">
      <div className="invite-management-header">
        <div>
          <span>{t("invitation.kicker")}</span>
          <h2>{t("invitation.title")}</h2>
          <p>{t("invitation.description")}</p>
        </div>
        <button type="button" onClick={loadInvitations} disabled={loading}>
          <span className="material-symbols-outlined">refresh</span>
          {loading ? t("common.loading") : t("invitation.refresh")}
        </button>
      </div>

      <div className="invite-management-grid">
        <form className="invite-management-card invite-form" onSubmit={handleSubmit} noValidate>
          <h3>{t("invitation.createTitle")}</h3>

          {message ? <div className="invite-alert is-success">{message}</div> : null}
          {error ? <div className="invite-alert is-error">{error}</div> : null}
          {inviteLink ? (
            <label>
              {t("invitation.testLink")}
              <input value={inviteLink} readOnly />
            </label>
          ) : null}

          <label>
            {t("invitation.inviteeEmail")}
            <input
              name="email"
              type="email"
              value={form.email}
              onChange={updateField}
              placeholder="name@example.com"
              required
            />
          </label>

          <label>
            {t("invitation.generation")}
            <input
              name="generation"
              type="number"
              min="1"
              step="1"
              value={form.generation}
              onChange={updateField}
              required
            />
          </label>

          {isAdmin ? (
            <>
              <label>
                {t("invitation.roleLabel")}
                <select name="role" value={form.role} onChange={updateField}>
                  <option value="member">{t("invitation.role.member")}</option>
                  <option value="manager">{t("invitation.role.manager")}</option>
                </select>
              </label>

              <label>
                {t("invitation.clan")}
                <select name="clan_id" value={form.clan_id} onChange={updateField} required>
                  <option value="">{t("invitation.selectClan")}</option>
                  {clans.map((clan) => (
                    <option key={clan.id} value={clan.id}>
                      {clan.clan_name || t("invitation.clanFallback", { id: clan.id })}
                    </option>
                  ))}
                </select>
              </label>
            </>
          ) : null}

          <button type="submit" disabled={sending}>
            <span className="material-symbols-outlined">{sending ? "progress_activity" : "outgoing_mail"}</span>
            {sending ? t("invitation.sending") : t("invitation.send")}
          </button>
        </form>

        <div className="invite-management-card">
          <h3>{t("invitation.recentTitle")}</h3>
          <div className="invite-table">
            <div className="invite-table-head">
              <span>Email</span>
              <span>{t("invitation.table.generation")}</span>
              <span>{t("invitation.roleLabel")}</span>
              <span>{t("invitation.table.status")}</span>
              <span>{t("invitation.table.expires")}</span>
            </div>
            {sortedInvitations.map((invite) => (
              <div className="invite-table-row" key={invite.id}>
                <span>{invite.email}</span>
                <span>{invite.generation || "-"}</span>
                <span>{roleLabel(invite.role, t)}</span>
                <span>{statusLabel(invite.status, t)}</span>
                <span>{invite.expires_at ? new Date(invite.expires_at).toLocaleString(i18n.language === "en" ? "en-US" : "vi-VN") : "-"}</span>
              </div>
            ))}
            {!sortedInvitations.length ? <p className="invite-empty">{t("invitation.empty")}</p> : null}
          </div>
        </div>
      </div>
    </section>
  );
}

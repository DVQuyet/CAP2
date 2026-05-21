import { useEffect, useMemo, useState } from "react";
import { apiRequest } from "../../../services/api";
import { createInvitation, listInvitations } from "../../../api/invitationService";
import { getStoredUser } from "../../../shared/utils/auth";
import "../../auth/pages/invite.css";

const initialForm = {
  email: "",
  role: "member",
  clan_id: "",
  generation: "1",
};

function statusLabel(status) {
  if (status === "accepted") return "Đã chấp nhận";
  if (status === "expired") return "Hết hạn";
  if (status === "revoked") return "Đã thu hồi";
  return "Đang chờ";
}

export default function InvitationPage() {
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
      setError(loadError?.message || "Không tải được danh sách lời mời.");
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
      setError("Vui lòng nhập email cần mời.");
      return;
    }
    if (isAdmin && !form.clan_id) {
      setError("Vui lòng chọn dòng họ cho lời mời.");
      return;
    }

    const generation = Number(form.generation);
    if (!Number.isInteger(generation) || generation <= 0) {
      setError("Vui lòng chọn đời gia phả hợp lệ.");
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
      setMessage(result.message || "Đã tạo lời mời.");
      setInviteLink(result.invite_link || "");
      setForm((current) => ({ ...initialForm, clan_id: current.clan_id }));
      await loadInvitations();
    } catch (submitError) {
      setError(submitError?.message || "Không gửi được lời mời.");
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="invite-management-page">
      <div className="invite-management-header">
        <div>
          <span>Mời thành viên</span>
          <h2>Gửi lời mời đăng ký bằng email</h2>
          <p>Email nhận lời mời sẽ được khóa trong link, người dùng chỉ tạo mật khẩu rồi hoàn thiện hồ sơ.</p>
        </div>
        <button type="button" onClick={loadInvitations} disabled={loading}>
          <span className="material-symbols-outlined">refresh</span>
          {loading ? "Đang tải..." : "Làm mới"}
        </button>
      </div>

      <div className="invite-management-grid">
        <form className="invite-management-card invite-form" onSubmit={handleSubmit}>
          <h3>Tạo lời mời</h3>

          {message ? <div className="invite-alert is-success">{message}</div> : null}
          {error ? <div className="invite-alert is-error">{error}</div> : null}
          {inviteLink ? (
            <label>
              Link test khi SMTP chưa cấu hình
              <input value={inviteLink} readOnly />
            </label>
          ) : null}

          <label>
            Email người được mời
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
            Đời gia phả
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
                Vai trò
                <select name="role" value={form.role} onChange={updateField}>
                  <option value="member">Member</option>
                  <option value="manager">Manager</option>
                </select>
              </label>

              <label>
                Dòng họ
                <select name="clan_id" value={form.clan_id} onChange={updateField} required>
                  <option value="">Chọn dòng họ</option>
                  {clans.map((clan) => (
                    <option key={clan.id} value={clan.id}>
                      {clan.clan_name || `Dòng họ #${clan.id}`}
                    </option>
                  ))}
                </select>
              </label>
            </>
          ) : null}

          <button type="submit" disabled={sending}>
            <span className="material-symbols-outlined">{sending ? "progress_activity" : "outgoing_mail"}</span>
            {sending ? "Đang gửi..." : "Gửi lời mời"}
          </button>
        </form>

        <div className="invite-management-card">
          <h3>Lời mời gần đây</h3>
          <div className="invite-table">
            <div className="invite-table-head">
              <span>Email</span>
              <span>Đời</span>
              <span>Vai trò</span>
              <span>Trạng thái</span>
              <span>Hết hạn</span>
            </div>
            {sortedInvitations.map((invite) => (
              <div className="invite-table-row" key={invite.id}>
                <span>{invite.email}</span>
                <span>{invite.generation || "-"}</span>
                <span>{invite.role}</span>
                <span>{statusLabel(invite.status)}</span>
                <span>{invite.expires_at ? new Date(invite.expires_at).toLocaleString("vi-VN") : "-"}</span>
              </div>
            ))}
            {!sortedInvitations.length ? <p className="invite-empty">Chưa có lời mời nào.</p> : null}
          </div>
        </div>
      </div>
    </section>
  );
}

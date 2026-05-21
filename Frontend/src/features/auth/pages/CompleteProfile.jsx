import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { completeMyProfile } from "../../../api/invitationService";
import DateInput from "../../../shared/components/DateInput";
import { persistAuthSession, getStoredUser } from "../../../shared/utils/auth";
import { vietnamDateToIso } from "../../../shared/utils/dateFormat";
import "./invite.css";

const initialForm = {
  full_name: "",
  gender: "",
  birth_date: "",
  phone: "",
  address: "",
  hometown: "",
  bio: "",
};

function dashboardPath(user) {
  const roleId = Number(user?.role_id);
  const role = user?.role_name || user?.role;
  if (roleId === 1 || role === "admin") return "/dashboard";
  if (roleId === 2 || role === "manager") return "/manager/dashboard";
  return "/user/dashboard";
}

export default function CompleteProfile() {
  const navigate = useNavigate();
  const user = getStoredUser();
  const [form, setForm] = useState(initialForm);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const updateField = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
    if (message) setMessage("");
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setMessage("");

    const fullName = form.full_name.trim();
    if (!fullName) {
      setMessage("Vui lòng nhập họ và tên.");
      return;
    }
    if (!form.gender) {
      setMessage("Vui lòng chọn giới tính.");
      return;
    }

    setSaving(true);
    try {
      const result = await completeMyProfile({
        ...form,
        full_name: fullName,
        birth_date: vietnamDateToIso(form.birth_date) || null,
      });
      persistAuthSession(result);
      navigate(dashboardPath(result.user), { replace: true });
    } catch (error) {
      setMessage(error?.message || "Không thể lưu hồ sơ.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="invite-auth-page">
      <section className="invite-profile-panel">
        <div className="invite-auth-header">
          <span className="material-symbols-outlined">badge</span>
          <h1>Hoàn thiện hồ sơ cá nhân</h1>
          <p>{user?.email ? `Tài khoản: ${user.email}` : "Nhập thông tin tối thiểu để vào hệ thống."}</p>
        </div>

        {message ? <div className="invite-alert is-error">{message}</div> : null}

        <form className="invite-form invite-form-grid" onSubmit={handleSubmit}>
          {user?.invite_generation ? (
            <label className="is-wide">
              Đời gia phả
              <input value={`Đời ${user.invite_generation}`} readOnly />
            </label>
          ) : null}

          <label className="is-wide">
            Họ và tên
            <input
              name="full_name"
              value={form.full_name}
              onChange={updateField}
              autoComplete="name"
              required
            />
          </label>

          <label>
            Giới tính
            <select name="gender" value={form.gender} onChange={updateField} required>
              <option value="">Chọn giới tính</option>
              <option value="male">Nam</option>
              <option value="female">Nữ</option>
              <option value="other">Khác / chưa rõ</option>
            </select>
          </label>

          <label>
            Ngày sinh
            <DateInput name="birth_date" value={form.birth_date} onChange={updateField} />
          </label>

          <label>
            Số điện thoại
            <input name="phone" value={form.phone} onChange={updateField} />
          </label>

          <label>
            Quê quán
            <input name="hometown" value={form.hometown} onChange={updateField} />
          </label>

          <label className="is-wide">
            Địa chỉ
            <input name="address" value={form.address} onChange={updateField} />
          </label>

          <label className="is-wide">
            Mô tả
            <textarea name="bio" value={form.bio} onChange={updateField} rows={4} />
          </label>

          <button type="submit" disabled={saving} className="is-wide">
            <span className="material-symbols-outlined">{saving ? "progress_activity" : "login"}</span>
            {saving ? "Đang lưu..." : "Hoàn tất và vào hệ thống"}
          </button>
        </form>
      </section>
    </main>
  );
}

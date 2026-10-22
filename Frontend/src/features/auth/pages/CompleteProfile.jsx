import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
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
      setMessage(t("auth.completeProfile.nameRequired"));
      return;
    }
    if (!form.gender) {
      setMessage(t("auth.completeProfile.genderRequired"));
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
      setMessage(error?.message || t("auth.completeProfile.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="invite-auth-page">
      <section className="invite-profile-panel">
        <div className="invite-auth-header">
          <span className="material-symbols-outlined">badge</span>
          <h1>{t("auth.completeProfile.title")}</h1>
          <p>{user?.email ? t("auth.completeProfile.account", { email: user.email }) : t("auth.completeProfile.subtitle")}</p>
        </div>

        {message ? <div className="invite-alert is-error">{message}</div> : null}

        <form className="invite-form invite-form-grid" onSubmit={handleSubmit}>
          {user?.invite_generation ? (
            <label className="is-wide">
              {t("auth.completeProfile.generationLabel")}
              <input value={t("auth.completeProfile.generationValue", { generation: user.invite_generation })} readOnly />
            </label>
          ) : null}

          <label className="is-wide">
            {t("common.fullName")}
            <input
              name="full_name"
              value={form.full_name}
              onChange={updateField}
              autoComplete="name"
              required
            />
          </label>

          <label>
            {t("common.gender")}
            <select name="gender" value={form.gender} onChange={updateField} required>
              <option value="">{t("auth.completeProfile.selectGender")}</option>
              <option value="male">{t("auth.completeProfile.male")}</option>
              <option value="female">{t("auth.completeProfile.female")}</option>
              <option value="other">{t("auth.completeProfile.other")}</option>
            </select>
          </label>

          <label>
            {t("common.birthDate")}
            <DateInput name="birth_date" value={form.birth_date} onChange={updateField} />
          </label>

          <label>
            {t("auth.completeProfile.phone")}
            <input name="phone" value={form.phone} onChange={updateField} />
          </label>

          <label>
            {t("common.hometown")}
            <input name="hometown" value={form.hometown} onChange={updateField} />
          </label>

          <label className="is-wide">
            {t("common.address")}
            <input name="address" value={form.address} onChange={updateField} />
          </label>

          <label className="is-wide">
            {t("auth.completeProfile.bio")}
            <textarea name="bio" value={form.bio} onChange={updateField} rows={4} />
          </label>

          <button type="submit" disabled={saving} className="is-wide">
            <span className="material-symbols-outlined">{saving ? "progress_activity" : "login"}</span>
            {saving ? t("common.saving") : t("auth.completeProfile.submit")}
          </button>
        </form>
      </section>
    </main>
  );
}

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  changeMemberPassword,
  getMemberDashboard,
  proposeProfileUpdate,
  updateMemberProfile,
} from "../../../api/memberService";
import ImageUpload from "../../../shared/components/ImageUpload";
import { getStoredUser } from "../../../shared/utils/auth";
import { resolveImageUrl } from "../../../shared/utils/media";
import "./MemberDashboard.css";

function personName(person, t) {
  return (
    person?.display_name ||
    [person?.surname, person?.middle_name, person?.first_name].filter(Boolean).join(" ").trim() ||
    t("posts.modal.detail.member")
  );
}

function profileStatusText(status, t) {
  if (status === "pending") return t("member.profile.status.pending");
  if (status === "approved") return t("member.profile.status.approved");
  if (status === "rejected") return t("member.profile.status.rejected");
  return t("member.profile.status.none");
}

function updateStoredUser(profile) {
  const current = getStoredUser() || {};
  const next = {
    ...current,
    name: profile.display_name || current.name,
    email: profile.email || current.email,
    status: profile.status || current.status,
    role_id: profile.role_id || current.role_id,
    avatar_url: resolveImageUrl({
      mediaId: profile.pending_avatar_media_id || profile.avatar_media_id,
      avatar_url: profile.pending_avatar_url || profile.avatar_url || current.avatar_url,
    }),
    avatar_media_id: profile.pending_avatar_media_id || profile.avatar_media_id || current.avatar_media_id || null,
  };
  localStorage.setItem("user", JSON.stringify(next));
  localStorage.setItem("auth_user", JSON.stringify(next));
}

export default function MemberProfile() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [savingBasic, setSavingBasic] = useState(false);
  const [savingRelations, setSavingRelations] = useState(false);
  const [savingContent, setSavingContent] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [profile, setProfile] = useState({});
  const [treeMembers, setTreeMembers] = useState([]);
  const [basicForm, setBasicForm] = useState({
    surname: "",
    middle_name: "",
    first_name: "",
    email: "",
    hometown: "",
    generation: "",
  });
  const [contentForm, setContentForm] = useState({ bio: "", avatar_url: "", avatar_media_id: null });
  const [relationForm, setRelationForm] = useState({ spouse_id: "", children_ids: [] });
  const [passwordForm, setPasswordForm] = useState({ current: "", next: "", confirm: "" });

  const loadProfile = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await getMemberDashboard();
      const nextProfile = response.profile || {};
      setProfile(nextProfile);
      setTreeMembers(response.treeMembers || []);
      setBasicForm({
        surname: nextProfile.surname || "",
        middle_name: nextProfile.middle_name || "",
        first_name: nextProfile.first_name || "",
        email: nextProfile.email || "",
        hometown: nextProfile.hometown || "",
        generation: nextProfile.generation ?? "",
      });
      setContentForm({
        bio: nextProfile.pending_bio != null ? nextProfile.pending_bio || "" : nextProfile.bio || "",
        avatar_url:
          nextProfile.pending_avatar_url != null
            ? resolveImageUrl({ mediaId: nextProfile.pending_avatar_media_id, avatar_url: nextProfile.pending_avatar_url || "" })
            : resolveImageUrl({ mediaId: nextProfile.avatar_media_id, avatar_url: nextProfile.avatar_url || "" }),
        avatar_media_id:
          nextProfile.pending_avatar_media_id != null
            ? nextProfile.pending_avatar_media_id || null
            : nextProfile.avatar_media_id || null,
      });
      setRelationForm({
        spouse_id: nextProfile.spouse_id ?? "",
        children_ids: Array.isArray(nextProfile.children_ids) ? nextProfile.children_ids.map(Number) : [],
      });
    } catch (err) {
      setError(err?.message || t("member.profile.messages.loadError"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const relationCandidates = useMemo(() => {
    return treeMembers.filter((member) => Number(member.id) !== Number(profile.person_id));
  }, [profile.person_id, treeMembers]);

  const childCandidates = useMemo(() => {
    return relationCandidates.filter((member) => String(member.id) !== String(relationForm.spouse_id));
  }, [relationCandidates, relationForm.spouse_id]);

  const selectedChildren = useMemo(() => new Set(relationForm.children_ids.map(Number)), [relationForm.children_ids]);

  const toggleChild = (id) => {
    setRelationForm((current) => {
      const next = new Set(current.children_ids.map(Number));
      if (next.has(Number(id))) next.delete(Number(id));
      else next.add(Number(id));
      return { ...current, children_ids: [...next].sort((a, b) => a - b) };
    });
  };

  const saveBasicProfile = async (event) => {
    event.preventDefault();
    setSavingBasic(true);
    setError("");
    setNotice("");
    try {
      const generationText = String(basicForm.generation ?? "").trim();
      const generation = generationText === "" ? null : Number(generationText);
      if (generationText !== "" && !Number.isFinite(generation)) {
        throw new Error(t("member.profile.messages.generationInvalid"));
      }

      const response = await updateMemberProfile({
        ...basicForm,
        generation,
      });
      updateStoredUser(response.profile || {});
      setNotice(t("member.profile.messages.basicSuccess"));
      await loadProfile();
    } catch (err) {
      setError(err?.message || t("member.profile.messages.basicError"));
    } finally {
      setSavingBasic(false);
    }
  };

  const saveContentForReview = async (event) => {
    event.preventDefault();
    setSavingContent(true);
    setError("");
    setNotice("");
    try {
      await proposeProfileUpdate({
        bio: contentForm.bio,
        avatar_url: contentForm.avatar_url,
        avatar_media_id: contentForm.avatar_media_id || null,
      });
      setNotice(t("member.profile.messages.proposeSuccess"));
      await loadProfile();
    } catch (err) {
      setError(err?.message || t("member.profile.messages.proposeError"));
    } finally {
      setSavingContent(false);
    }
  };

  const saveRelations = async (event) => {
    event.preventDefault();
    setSavingRelations(true);
    setError("");
    setNotice("");
    try {
      const spouseId = String(relationForm.spouse_id || "").trim();
      const response = await updateMemberProfile({
        spouse_id: spouseId === "" ? null : Number(spouseId),
        children_ids: relationForm.children_ids,
      });
      updateStoredUser(response.profile || {});
      setNotice(t("member.profile.messages.relationsSuccess"));
      await loadProfile();
    } catch (err) {
      setError(err?.message || t("member.profile.messages.relationsError"));
    } finally {
      setSavingRelations(false);
    }
  };

  const savePassword = async (event) => {
    event.preventDefault();
    setSavingPassword(true);
    setError("");
    setNotice("");
    try {
      if (!passwordForm.current) throw new Error(t("member.profile.messages.passwordCurrentRequired"));
      if (passwordForm.next.length < 6) throw new Error(t("member.profile.messages.passwordLength"));
      if (passwordForm.next !== passwordForm.confirm) throw new Error(t("member.profile.messages.passwordMismatch"));

      await changeMemberPassword({
        current_password: passwordForm.current,
        new_password: passwordForm.next,
      });
      setPasswordForm({ current: "", next: "", confirm: "" });
      setNotice(t("member.profile.messages.passwordSuccess"));
    } catch (err) {
      setError(err?.message || t("member.profile.messages.passwordError"));
    } finally {
      setSavingPassword(false);
    }
  };

  if (loading) {
    return (
      <div className="member-portal-page">
        <section className="member-panel">
          <div className="member-empty">{t("member.profile.messages.loading")}</div>
        </section>
      </div>
    );
  }

  return (
    <div className="member-portal-page">
      {(error || notice) && <div className={`member-alert ${error ? "is-error" : "is-success"}`}>{error || notice}</div>}

      <section className="member-hero-panel">
        <div>
          <span className="member-kicker">{t("member.profile.title")}</span>
          <h1>{personName(profile, t)}</h1>
          <p>{t("member.profile.subtitle")}</p>
        </div>
        {(() => {
  const avatarSrc = resolveImageUrl({
    mediaId: contentForm.avatar_media_id,
    avatar_url: contentForm.avatar_url,
  });

  return avatarSrc ? (
    <img className="member-profile-avatar" src={avatarSrc} alt="" />
  ) : null;
})()}
      </section>

      <div className="member-content-grid">
        <section className="member-panel">
          <div className="member-panel-header">
            <div>
              <h2>{t("member.profile.basicInfo.title")}</h2>
              <p>{t("member.profile.basicInfo.subtitle")}</p>
            </div>
          </div>
          <form className="member-form" onSubmit={saveBasicProfile}>
            <div className="member-form-grid">
              <label className="member-label">
                {t("member.profile.basicInfo.fields.surname")}
                <input value={basicForm.surname} onChange={(event) => setBasicForm((current) => ({ ...current, surname: event.target.value }))} />
              </label>
              <label className="member-label">
                {t("member.profile.basicInfo.fields.middleName")}
                <input value={basicForm.middle_name} onChange={(event) => setBasicForm((current) => ({ ...current, middle_name: event.target.value }))} />
              </label>
              <label className="member-label">
                {t("member.profile.basicInfo.fields.firstName")}
                <input value={basicForm.first_name} onChange={(event) => setBasicForm((current) => ({ ...current, first_name: event.target.value }))} />
              </label>
              <label className="member-label">
                {t("member.profile.basicInfo.fields.generation")}
                <input
                  type="number"
                  min={1}
                  value={basicForm.generation}
                  onChange={(event) => setBasicForm((current) => ({ ...current, generation: event.target.value }))}
                />
              </label>
              <label className="member-label member-form-full">
                {t("member.profile.basicInfo.fields.email")}
                <input type="email" value={basicForm.email} onChange={(event) => setBasicForm((current) => ({ ...current, email: event.target.value }))} />
              </label>
              <label className="member-label member-form-full">
                {t("member.profile.basicInfo.fields.hometown")}
                <input value={basicForm.hometown} onChange={(event) => setBasicForm((current) => ({ ...current, hometown: event.target.value }))} />
              </label>
            </div>
            <button className="member-btn member-btn-primary" type="submit" disabled={savingBasic || !profile.person_id}>
              {t("member.profile.basicInfo.submit")}
            </button>
          </form>
        </section>

        <section className="member-panel">
          <div className="member-panel-header">
            <div>
              <h2>{t("member.profile.mediaBio.title")}</h2>
              <p>
                {t("member.profile.mediaBio.statusLabel")} <span className={`member-status status-${profile.moderation_status || "none"}`}>{profileStatusText(profile.moderation_status, t)}</span>
              </p>
            </div>
          </div>
          <form className="member-form" onSubmit={saveContentForReview}>
            <ImageUpload
              label={t("member.profile.mediaBio.uploadLabel")}
              value={contentForm.avatar_url}
              usageType="pending_avatar"
              onUploadSuccess={(url, file) =>
                setContentForm((current) => ({
                  ...current,
                  avatar_url: url,
                  avatar_media_id: file?.mediaId || file?.media_id || null,
                }))
              }
            />
            <label className="member-label">
              {t("member.profile.mediaBio.urlLabel")}
              <input value={contentForm.avatar_url} onChange={(event) => setContentForm((current) => ({ ...current, avatar_url: event.target.value, avatar_media_id: null }))} />
            </label>
            <label className="member-label">
              {t("member.profile.mediaBio.bioLabel")}
              <textarea rows={5} value={contentForm.bio} onChange={(event) => setContentForm((current) => ({ ...current, bio: event.target.value }))} />
            </label>
            {profile.moderation_reason && <div className="member-empty">{t("member.profile.mediaBio.moderationNote", { reason: profile.moderation_reason })}</div>}
            <button className="member-btn member-btn-primary" type="submit" disabled={savingContent || profile.moderation_status === "pending" || !profile.person_id}>
              {t("member.profile.mediaBio.submit")}
            </button>
          </form>
        </section>
      </div>

      <div className="member-content-grid">
        <section className="member-panel">
          <div className="member-panel-header">
            <div>
              <h2>{t("member.profile.relations.title")}</h2>
              <p>{t("member.profile.relations.subtitle")}</p>
            </div>
          </div>
          <div className="member-empty">
            {t("member.profile.relations.lockedNote")}
          </div>
          <form className="member-form" onSubmit={saveRelations} style={{ display: "none" }}>
            <label className="member-label">
              {t("member.profile.relations.spouse")}
              <select value={relationForm.spouse_id} onChange={(event) => setRelationForm((current) => ({ ...current, spouse_id: event.target.value }))}>
                <option value="">{t("member.profile.relations.unselected")}</option>
                {relationCandidates.map((member) => (
                  <option key={member.id} value={member.id}>
                    {personName(member, t)} (ID {member.id})
                  </option>
                ))}
              </select>
            </label>
            <div className="member-label">
              {t("member.profile.relations.children")}
              <div className="member-checkbox-list">
                {childCandidates.length === 0 ? (
                  <div className="member-empty">{t("member.profile.relations.empty")}</div>
                ) : (
                  childCandidates.map((member) => (
                    <label className="member-checkbox-row" key={member.id}>
                      <input type="checkbox" checked={selectedChildren.has(Number(member.id))} onChange={() => toggleChild(member.id)} />
                      <span>{personName(member, t)} (ID {member.id})</span>
                    </label>
                  ))
                )}
              </div>
            </div>
            <button className="member-btn member-btn-primary" type="submit" disabled={savingRelations || !profile.person_id}>
              {t("member.profile.relations.submit")}
            </button>
          </form>
        </section>

        <section className="member-panel">
          <div className="member-panel-header">
            <div>
              <h2>{t("member.profile.password.title")}</h2>
              <p>{t("member.profile.password.subtitle")}</p>
            </div>
          </div>
          <form className="member-form" onSubmit={savePassword}>
            <label className="member-label">
              {t("member.profile.password.fields.current")}
              <input
                type="password"
                value={passwordForm.current}
                onChange={(event) => setPasswordForm((current) => ({ ...current, current: event.target.value }))}
                autoComplete="current-password"
              />
            </label>
            <label className="member-label">
              {t("member.profile.password.fields.next")}
              <input
                type="password"
                value={passwordForm.next}
                onChange={(event) => setPasswordForm((current) => ({ ...current, next: event.target.value }))}
                autoComplete="new-password"
              />
            </label>
            <label className="member-label">
              {t("member.profile.password.fields.confirm")}
              <input
                type="password"
                value={passwordForm.confirm}
                onChange={(event) => setPasswordForm((current) => ({ ...current, confirm: event.target.value }))}
                autoComplete="new-password"
              />
            </label>
            <button className="member-btn member-btn-primary" type="submit" disabled={savingPassword}>
              {t("member.profile.password.submit")}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}

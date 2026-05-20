import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createMember,
  getMemberDetail,
  getMemberRelations,
  getMembers,
  updateMemberRelations,
  updateMemberByManager,
} from "../../../api/managerService";
import { getStoredUser } from "../../../shared/utils/auth";
import { formatLunarFullFromSolar } from "../../../shared/utils/lunarCalendar";
import DateInput from "../../../shared/components/DateInput";
import { isoToVietnamDate, vietnamDateToIso } from "../../../shared/utils/dateFormat";
import { compactPayload, fullName } from "../utils/managerData";
import { useLanguage } from "../../../i18n/LanguageContext";
import "./manager.css";

const shouldSuppressInlineRelationError = (error) => Boolean(error?.__centeredNoticeShown);

const emptyCreateForm = {
  email: "",
  password: "",
  surname: "",
  middle_name: "",
  first_name: "",
  gender: "1",
  birth_date: "",
  hometown: "",
  generation: "1",
  clan_id: "",
};

const emptyEditForm = {
  email: "",
  status: "active",
  role_id: "3",
  surname: "",
  middle_name: "",
  first_name: "",
  gender: "1",
  birth_date: "",
  death_date: "",
  is_living: "1",
  generation: "1",
  branch: "",
  hometown: "",
  address: "",
  phone: "",
  people_email: "",
  avatar_url: "",
  bio: "",
  note: "",
  new_password: "",
};

const emptyRelationForm = {
  parent_father_id: "",
  parent_mother_id: "",
  family_id: "",
  spouse_id: "",
  children_ids: "",
};

const isDeceasedMember = (member) => {
  const value = member?.is_living;
  const normalized = String(value ?? "").trim().toLowerCase();

  return (
    value === 0 ||
    value === false ||
    normalized === "0" ||
    normalized === "false" ||
    normalized === "dead" ||
    normalized === "deceased" ||
    Boolean(member?.death_date)
  );
};

const toEditForm = (member) => ({
  ...emptyEditForm,
  email: member.email || "",
  status: member.status || "active",
  role_id: String(member.role_id ?? 3),
  surname: member.surname || "",
  middle_name: member.middle_name || "",
  first_name: member.first_name || "",
  gender: member.gender == null ? "" : String(member.gender),
  birth_date: isoToVietnamDate(member.birth_date),
  death_date: isoToVietnamDate(member.death_date),
  is_living: isDeceasedMember(member) ? "0" : "1",
  generation: member.generation == null ? "1" : String(member.generation),
  branch: member.branch == null ? "" : String(member.branch),
  hometown: member.hometown || "",
  address: member.address || "",
  phone: member.phone || "",
  people_email: member.people_email || "",
  avatar_url: member.avatar_url || "",
  bio: member.bio || "",
  note: member.note || "",
});

const idText = (value) => (value == null || value === "" ? "" : String(value));

function LunarDateHint({ value, label = "Âm lịch" }) {
  const text = formatLunarFullFromSolar(value);
  if (!text) return null;

  return (
    <small className="mgr-lunarHint">
      {label}: {text}
    </small>
  );
}

export default function AccountPage() {
  const { t } = useLanguage();
  const currentUser = getStoredUser();

  const [members, setMembers] = useState([]);
  const [createForm, setCreateForm] = useState(emptyCreateForm);
  const [createOpen, setCreateOpen] = useState(false);
  const [relationOpen, setRelationOpen] = useState(false);

  const [relationAccountId, setRelationAccountId] = useState("");
  const [relationForm, setRelationForm] = useState(emptyRelationForm);
  const [relationDetails, setRelationDetails] = useState(null);

  const [editAccountId, setEditAccountId] = useState(null);
  const [editForm, setEditForm] = useState(emptyEditForm);

  const [search, setSearch] = useState("");
  const [genderFilter, setGenderFilter] = useState("");
  const [livingFilter, setLivingFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [generationFilter, setGenerationFilter] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [relationLoading, setRelationLoading] = useState(false);
  const [relationSaving, setRelationSaving] = useState(false);
  const [relationMessage, setRelationMessage] = useState("");

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const isAdmin = Number(currentUser?.role_id) === 1;
  const canAssignManager = isAdmin || Number(currentUser?.role_id) === 2;

  const normalizeText = (value) =>
    String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();

  const getGenderLabel = (gender) => {
    if (String(gender) === "1" || String(gender).toLowerCase() === "male") return t("manager.accounts.form.genderMale");
    if (String(gender) === "2" || String(gender).toLowerCase() === "female") return t("manager.accounts.form.genderFemale");
    return t("manager.accounts.form.genderUnknown");
  };

  const getLivingLabel = (member) => {
    if (isDeceasedMember(member)) return t("manager.accounts.form.statusDead");
    return t("manager.accounts.form.statusLiving");
  };

  const getStatusLabel = (status) => {
    if (status === "active") return t("common.status.active") || "Active";
    if (status === "pending") return t("common.status.pending") || "Pending";
    if (status === "rejected") return t("common.status.rejected") || "Rejected";
    if (status === "no_account" || !status) return "Chưa có tài khoản";
    return status || t("manager.accounts.form.genderUnknown");
  };

  const loadMembers = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const memberRows = await getMembers();
      setMembers(Array.isArray(memberRows) ? memberRows : []);
    } catch (err) {
      setError(err?.message || t("manager.accounts.messages.loadError"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  const generationOptions = useMemo(() => {
    return [...new Set(members.map((m) => m.generation).filter(Boolean))]
      .sort((a, b) => Number(a) - Number(b))
      .map(String);
  }, [members]);

  const filteredMembers = useMemo(() => {
    const q = normalizeText(search);

    return members.filter((member) => {
      const matchSearch =
        !q ||
        [
          fullName(member),
          member.email,
          member.hometown,
          member.phone,
          member.person_id,
          member.account_id,
          member.branch,
          member.generation,
        ]
          .filter((value) => value != null)
          .some((value) => normalizeText(value).includes(q));

      const matchGender =
        !genderFilter || String(member.gender || "") === String(genderFilter);

      const matchLiving =
        !livingFilter ||
        (livingFilter === "living" &&
          !isDeceasedMember(member)) ||
        (livingFilter === "dead" &&
          isDeceasedMember(member));

      const matchStatus =
        !statusFilter || String(member.status || "") === String(statusFilter);

      const matchGeneration =
        !generationFilter ||
        String(member.generation || "") === String(generationFilter);

      return matchSearch && matchGender && matchLiving && matchStatus && matchGeneration;
    });
  }, [members, search, genderFilter, livingFilter, statusFilter, generationFilter]);

  const summary = useMemo(() => {
    const total = members.length;
    const male = members.filter((m) => String(m.gender) === "1").length;
    const female = members.filter((m) => String(m.gender) === "2").length;
    const living = members.filter(
      (m) => !isDeceasedMember(m)
    ).length;
    const pending = members.filter((m) => m.status === "pending").length;

    return { total, male, female, living, pending };
  }, [members]);

  const personOptions = useMemo(
    () =>
      members
        .filter((member) => member.person_id != null)
        .map((member) => ({
          accountId: member.account_id == null ? "" : String(member.account_id),
          personId: String(member.person_id),
          label: `${fullName(member)}${member.generation ? ` (${t("manager.accounts.form.placeholderGeneration")} ${member.generation})` : ""}${member.account_id ? "" : " - chưa có tài khoản"}`,
        })),
    [members]
  );

  const memberOptions = useMemo(
    () => personOptions.filter((member) => member.accountId),
    [personOptions]
  );

  const selectedRelationMember = useMemo(
    () =>
      members.find((member) => member.account_id && String(member.account_id) === String(relationAccountId)) ||
      null,
    [members, relationAccountId]
  );

  const relationPersonOptions = useMemo(() => {
    const selectedPersonId =
      selectedRelationMember?.person_id == null
        ? ""
        : String(selectedRelationMember.person_id);

    return personOptions.filter((member) => member.personId !== selectedPersonId);
  }, [personOptions, selectedRelationMember]);

  const updateCreateField = (event) => {
    const { name, value } = event.target;
    if (["surname", "middle_name", "first_name"].includes(name)) {
      const cleanValue = value.replace(/[^\p{L}\s]/gu, "");
      setCreateForm((prev) => ({ ...prev, [name]: cleanValue }));
    } else {
      setCreateForm((prev) => ({ ...prev, [name]: value }));
    }
  };

  const updateRelationField = (event) => {
    const { name, value } = event.target;
    if (name === "family_id") {
      const family = (relationDetails?.marriage?.families || []).find(
        (item) => String(item.family_id || item.id) === String(value)
      );
      setRelationForm((prev) => ({
        ...prev,
        family_id: value,
        spouse_id: idText(family?.spouse_id ?? prev.spouse_id),
        children_ids: Array.isArray(family?.children_ids)
          ? family.children_ids.join(", ")
          : prev.children_ids,
      }));
      return;
    }
    setRelationForm((prev) => ({ ...prev, [name]: value }));
  };

  const updateChildrenSelection = (event) => {
    const values = Array.from(event.target.selectedOptions, (option) => option.value);
    setRelationForm((prev) => ({ ...prev, children_ids: values.join(", ") }));
  };

  const updateEditField = (event) => {
    const { name, value } = event.target;
    if (name === "is_living" && value === "1") {
      setEditForm((prev) => ({ ...prev, is_living: value, death_date: "" }));
      return;
    }

    if (["surname", "middle_name", "first_name"].includes(name)) {
      const cleanValue = value.replace(/[^\p{L}\s]/gu, "");
      setEditForm((prev) => ({ ...prev, [name]: cleanValue }));
    } else {
      setEditForm((prev) => ({ ...prev, [name]: value }));
    }
  };

  const loadRelationDetails = useCallback(
    async (accountId, nextMessage = t("manager.accounts.messages.loadRelationSuccess") || "Loaded relations.") => {
      if (!accountId) {
        setRelationForm(emptyRelationForm);
        setRelationDetails(null);
        setRelationMessage("");
        return;
      }

      setRelationLoading(true);
      setRelationMessage("");
      setError("");

      try {
        const data = await getMemberRelations(accountId);
        const families = Array.isArray(data?.marriage?.families) ? data.marriage.families : [];
        const defaultFamilyId =
          families.length === 1
            ? families[0].family_id || families[0].id
            : data?.marriage?.family_id;

        setRelationDetails(data);
        setRelationForm({
          parent_father_id: idText(data?.bloodline?.parent_father_id),
          parent_mother_id: idText(data?.bloodline?.parent_mother_id),
          family_id: idText(defaultFamilyId),
          spouse_id: idText(data?.marriage?.spouse_id),
          children_ids: Array.isArray(data?.marriage?.children_ids)
            ? data.marriage.children_ids.join(", ")
            : "",
        });
        setRelationMessage(nextMessage);
      } catch (err) {
        setRelationForm(emptyRelationForm);
        setRelationDetails(null);
        setError(err?.message || t("manager.accounts.messages.loadRelationError"));
      } finally {
        setRelationLoading(false);
      }
    },
    []
  );

  const selectRelationMember = (event) => {
    const accountId = event.target.value;
    setRelationAccountId(accountId);
    loadRelationDetails(accountId);
  };

  const submitCreate = async (event) => {
    event.preventDefault();

    setSaving(true);
    setMessage("");
    setError("");

    try {
      const payload = compactPayload({
        ...createForm,
        birth_date: vietnamDateToIso(createForm.birth_date) || null,
      });

      if (!isAdmin) delete payload.clan_id;

      await createMember(payload);
      setCreateForm(emptyCreateForm);
      setMessage(t("manager.accounts.messages.createSuccess"));
      setCreateOpen(false);
      await loadMembers();
    } catch (err) {
      setError(err?.message || t("manager.accounts.messages.createError"));
    } finally {
      setSaving(false);
    }
  };

  const saveRelations = async (event) => {
    event.preventDefault();

    if (!relationAccountId) {
      setRelationMessage(t("manager.accounts.messages.linkPrompt"));
      return;
    }

    const hasBloodline =
      relationForm.parent_father_id || relationForm.parent_mother_id;

    const shouldSaveMarriage =
      relationForm.spouse_id ||
      relationForm.children_ids.trim() ||
      relationDetails?.marriage?.family_id ||
      relationDetails?.marriage?.spouse_id ||
      (Array.isArray(relationDetails?.marriage?.children_ids) &&
        relationDetails.marriage.children_ids.length > 0);

    if (!hasBloodline && !shouldSaveMarriage) {
      setRelationMessage(t("manager.accounts.messages.noRelationData"));
      return;
    }

    if (relationForm.children_ids.trim() && !relationForm.family_id) {
      setRelationMessage(t("manager.accounts.messages.selectFamilyPrompt"));
      return;
    }

    setRelationSaving(true);
    setRelationMessage("");
    setError("");

    try {
      if (hasBloodline) {
        await updateMemberRelations(relationAccountId, {
          mode: "bloodline",
          parent_father_id: relationForm.parent_father_id || null,
          parent_mother_id: relationForm.parent_mother_id || null,
        });
      }

      if (shouldSaveMarriage) {
        await updateMemberRelations(relationAccountId, {
          mode: "marriage",
          family_id: relationForm.family_id || null,
          spouse_id: relationForm.spouse_id || null,
          children_ids: relationForm.children_ids,
        });
      }

      await loadRelationDetails(relationAccountId, t("manager.accounts.messages.saveRelationSuccess"));
    } catch (err) {
      if (!shouldSuppressInlineRelationError(err)) setError(err?.message || t("manager.accounts.messages.saveRelationError"));
    } finally {
      setRelationSaving(false);
    }
  };

  const openEdit = async (accountId) => {
    setEditAccountId(accountId);
    setMessage("");
    setError("");

    try {
      const data = await getMemberDetail(accountId);
      setEditForm(toEditForm(data.member || {}));
    } catch (err) {
      setError(err?.message || t("manager.accounts.messages.loadError"));
      setEditAccountId(null);
    }
  };

  const saveEdit = async () => {
    if (!editAccountId) return;

    setSaving(true);
    setMessage("");
    setError("");

    try {
      await updateMemberByManager(
        editAccountId,
        compactPayload({
          ...editForm,
          birth_date: vietnamDateToIso(editForm.birth_date) || null,
          death_date:
            editForm.is_living === "1"
              ? null
              : vietnamDateToIso(editForm.death_date) || null,
        })
      );

      setMessage(t("manager.accounts.messages.editSuccess"));
      setEditAccountId(null);
      await loadMembers();
    } catch (err) {
      setError(err?.message || t("manager.accounts.messages.editError"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="manager-data-page member-manager-pro">
      <div className="member-pro-header">
        <div>
          <span>{t("manager.accounts.hero.kicker")}</span>
          <h2>{t("manager.accounts.hero.title")}</h2>
          <p>{t("manager.accounts.hero.description")}</p>
        </div>

        <div className="member-pro-header-actions">
          <button
            className="member-pro-btn member-pro-btn-light"
            type="button"
            onClick={loadMembers}
            disabled={loading}
          >
            <span className="material-symbols-outlined">refresh</span>
            {loading ? t("manager.accounts.actions.refreshing") : t("manager.accounts.actions.refresh")}
          </button>

          <button
            className="member-pro-btn member-pro-btn-gold"
            type="button"
            onClick={() => {
              setRelationOpen(false);
              setCreateOpen(true);
            }}
          >
            <span className="material-symbols-outlined">person_add</span>
            {t("manager.accounts.actions.addMember")}
          </button>
        </div>
      </div>

      {message && <div className="manager-inline-message">{message}</div>}
      {error && <div className="manager-inline-error">{error}</div>}

      <div className="member-pro-summary">
        <div className="member-pro-stat">
          <span className="material-symbols-outlined">groups</span>
          <div>
            <strong>{summary.total}</strong>
            <p>{t("manager.accounts.summary.total")}</p>
          </div>
        </div>

        <div className="member-pro-stat">
          <span className="material-symbols-outlined">male</span>
          <div>
            <strong>{summary.male}</strong>
            <p>{t("manager.accounts.summary.male")}</p>
          </div>
        </div>

        <div className="member-pro-stat">
          <span className="material-symbols-outlined">female</span>
          <div>
            <strong>{summary.female}</strong>
            <p>{t("manager.accounts.summary.female")}</p>
          </div>
        </div>

        <div className="member-pro-stat">
          <span className="material-symbols-outlined">favorite</span>
          <div>
            <strong>{summary.living}</strong>
            <p>{t("manager.accounts.summary.living")}</p>
          </div>
        </div>

        <div className="member-pro-stat">
          <span className="material-symbols-outlined">pending_actions</span>
          <div>
            <strong>{summary.pending}</strong>
            <p>{t("manager.accounts.summary.pending")}</p>
          </div>
        </div>
      </div>

      {relationOpen && (
        <div className="member-pro-tools-grid">
          {false && createOpen && (
            <div className="member-pro-panel">
              <div className="member-pro-panel-head">
                <div>
                  <h3>{t("manager.accounts.form.createTitle")}</h3>
                  <p>{t("manager.accounts.form.createDescription")}</p>
                </div>

                <button
                  className="member-pro-icon-btn"
                  type="button"
                  onClick={() => setCreateOpen(false)}
                >
                  ×
                </button>
              </div>

              <form className="member-pro-form" onSubmit={submitCreate}>
                <div className="member-pro-form-grid">
                  <input
                    className="mgr-field"
                    name="email"
                    type="email"
                    value={createForm.email}
                    onChange={updateCreateField}
                    placeholder={t("manager.accounts.form.placeholderEmail")}
                    required
                  />

                  <input
                    className="mgr-field"
                    name="password"
                    type="password"
                    value={createForm.password}
                    onChange={updateCreateField}
                    placeholder={t("manager.accounts.form.placeholderPassword")}
                    required
                  />

                  <input
                    className="mgr-field"
                    name="surname"
                    value={createForm.surname}
                    onChange={updateCreateField}
                    placeholder={t("manager.accounts.form.placeholderSurname")}
                  />

                  <input
                    className="mgr-field"
                    name="middle_name"
                    value={createForm.middle_name}
                    onChange={updateCreateField}
                    placeholder={t("manager.accounts.form.placeholderMiddleName")}
                  />

                  <input
                    className="mgr-field"
                    name="first_name"
                    value={createForm.first_name}
                    onChange={updateCreateField}
                    placeholder={t("manager.accounts.form.placeholderFirstName")}
                    required
                  />

                  <select
                    className="mgr-field"
                    name="gender"
                    value={createForm.gender}
                    onChange={updateCreateField}
                  >
                    <option value="1">{t("manager.accounts.form.genderMale")}</option>
                    <option value="2">{t("manager.accounts.form.genderFemale")}</option>
                    <option value="">{t("manager.accounts.form.genderUnknown")}</option>
                  </select>

                  <input
                    className="mgr-field"
                    name="generation"
                    type="number"
                    min="1"
                    value={createForm.generation}
                    onChange={updateCreateField}
                    placeholder={t("manager.accounts.form.placeholderGeneration")}
                  />

                  <div className="mgr-dateField">
                    <DateInput
                      className="mgr-field"
                      name="birth_date"
                      value={createForm.birth_date}
                      onChange={updateCreateField}
                    />
                    <LunarDateHint value={createForm.birth_date} label={t("manager.accounts.form.placeholderBirthDate") + " (L)"} />
                  </div>

                  <input
                    className="mgr-field member-pro-full"
                    name="hometown"
                    value={createForm.hometown}
                    onChange={updateCreateField}
                    placeholder={t("manager.accounts.form.placeholderHometown")}
                  />

                  {isAdmin && (
                    <input
                      className="mgr-field"
                      name="clan_id"
                      type="number"
                      value={createForm.clan_id}
                      onChange={updateCreateField}
                      placeholder="clan_id"
                    />
                  )}
                </div>

                <button className="mgr-btnPrimary" type="submit" disabled={saving}>
                  {saving ? t("manager.accounts.actions.saving") : t("manager.accounts.actions.addMember")}
                </button>
              </form>
            </div>
          )}

          {relationOpen && (
            <div className="member-pro-panel">
              <div className="member-pro-panel-head">
                <div>
                  <h3>{t("manager.accounts.form.linkTitle")}</h3>
                  <p>{t("manager.accounts.form.linkDescription")}</p>
                </div>

                <button
                  className="member-pro-icon-btn"
                  type="button"
                  onClick={() => setRelationOpen(false)}
                >
                  ×
                </button>
              </div>

              <form className="member-pro-form" onSubmit={saveRelations}>
                <label className="relation-field">
                  <span>{t("manager.accounts.form.selectMember")}</span>
                  <select
                    className="mgr-field"
                    value={relationAccountId}
                    onChange={selectRelationMember}
                  >
                    <option value="">{t("manager.accounts.form.selectMemberPrompt")}</option>
                    {memberOptions.map((member) => (
                      <option key={member.accountId} value={member.accountId}>
                        {member.label}
                      </option>
                    ))}
                  </select>
                </label>

                {relationAccountId && (
                  <>
                    <div className="member-pro-form-grid">
                      <label className="relation-field">
                        <span>{t("manager.accounts.form.marriageTitle")}</span>
                        <select
                          className="mgr-field"
                          name="family_id"
                          value={relationForm.family_id}
                          onChange={updateRelationField}
                          disabled={relationLoading}
                        >
                          <option value="">{t("manager.accounts.form.marriagePrompt")}</option>
                          {(relationDetails?.marriage?.families || []).map((family) => (
                            <option key={family.family_id || family.id} value={family.family_id || family.id}>
                              {`#${family.family_id || family.id} - ${family.spouse_name || "Chua co vo/chong"} (${family.relationship_status || "active"})`}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="relation-field">
                        <span>{t("manager.accounts.form.parentFather")}</span>
                        <select
                          className="mgr-field"
                          name="parent_father_id"
                          value={relationForm.parent_father_id}
                          onChange={updateRelationField}
                          disabled={relationLoading}
                        >
                          <option value="">{t("manager.accounts.form.parentFatherPrompt")}</option>
                          {relationPersonOptions.map((member) => (
                            <option key={member.personId} value={member.personId}>
                              {member.label}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="relation-field">
                        <span>{t("manager.accounts.form.parentMother")}</span>
                        <select
                          className="mgr-field"
                          name="parent_mother_id"
                          value={relationForm.parent_mother_id}
                          onChange={updateRelationField}
                          disabled={relationLoading}
                        >
                          <option value="">{t("manager.accounts.form.parentMotherPrompt")}</option>
                          {relationPersonOptions.map((member) => (
                            <option key={member.personId} value={member.personId}>
                              {member.label}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="relation-field">
                        <span>{t("manager.accounts.form.spouse")}</span>
                        <select
                          className="mgr-field"
                          name="spouse_id"
                          value={relationForm.spouse_id}
                          onChange={updateRelationField}
                          disabled={relationLoading}
                        >
                          <option value="">{t("manager.accounts.form.spousePrompt")}</option>
                          {relationPersonOptions.map((member) => (
                            <option key={member.personId} value={member.personId}>
                              {member.label}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="relation-field">
                        <span>{t("manager.accounts.form.children")}</span>
                        <select
                          className="mgr-field relation-children-select"
                          multiple
                          value={
                            relationForm.children_ids
                              ? relationForm.children_ids
                                  .split(",")
                                  .map((item) => item.trim())
                                  .filter(Boolean)
                              : []
                          }
                          onChange={updateChildrenSelection}
                          disabled={relationLoading}
                        >
                          {relationPersonOptions.map((member) => (
                            <option key={member.personId} value={member.personId}>
                              {member.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>

                    <div className="relation-summary">
                      <strong>{t("manager.accounts.form.currentRelations")}</strong>
                      <span>{t("manager.accounts.form.parentFather")}: {relationDetails?.bloodline?.parent_father_name || t("manager.accounts.form.noInfo")}</span>
                      <span>{t("manager.accounts.form.parentMother")}: {relationDetails?.bloodline?.parent_mother_name || t("manager.accounts.form.noInfo")}</span>
                      <span>{t("manager.accounts.form.spouse")}: {relationDetails?.marriage?.spouse_name || t("manager.accounts.form.noInfo")}</span>
                      <span>
                        {t("manager.accounts.form.children")}:{" "}
                        {relationDetails?.marriage?.children?.length
                          ? relationDetails.marriage.children.map((child) => child.name).join(", ")
                          : t("manager.accounts.form.noInfo")}
                      </span>
                    </div>

                    <div className="relation-summary">
                      {(relationDetails?.marriage?.families || []).map((family) => (
                        <span key={family.family_id || family.id}>
                          {`Family #${family.family_id || family.id}: ${family.spouse_name || "Chua co vo/chong"} - ${family.relationship_status || "active"} - con: ${
                            family.children?.length
                              ? family.children.map((child) => child.name || child.display_name).join(", ")
                              : "Chua co"
                          }`}
                        </span>
                      ))}
                    </div>

                    {relationMessage && <div className="mgr-subtle">{relationMessage}</div>}

                    <button
                      className="mgr-btnPrimary"
                      type="submit"
                      disabled={relationLoading || relationSaving}
                    >
                      {relationSaving ? t("manager.accounts.actions.saving") : t("manager.accounts.actions.save")}
                    </button>
                  </>
                )}
              </form>
            </div>
          )}
        </div>
      )}

      {createOpen && (
        <div
          className="mgr-modalOverlay"
          role="presentation"
          onClick={() => !saving && setCreateOpen(false)}
        >
          <form
            className="mgr-modal member-pro-modal member-pro-create-modal"
            role="dialog"
            aria-modal="true"
            onSubmit={submitCreate}
            onClick={(event) => event.stopPropagation()}
          >
            <button
              className="mgr-modalClose"
              type="button"
              onClick={() => setCreateOpen(false)}
              disabled={saving}
            >
              &times;
            </button>

            <h2 className="mgr-modalTitle">{t("manager.accounts.form.createTitle")}</h2>
            <p className="mgr-modalMeta">{t("manager.accounts.form.createDescription")}</p>

            <div className="member-pro-form-grid">
              <input
                className="mgr-field"
                name="email"
                type="email"
                value={createForm.email}
                onChange={updateCreateField}
                placeholder={t("manager.accounts.form.placeholderEmail")}
                required
              />

              <input
                className="mgr-field"
                name="password"
                type="password"
                value={createForm.password}
                onChange={updateCreateField}
                placeholder={t("manager.accounts.form.placeholderPassword")}
                required
              />

              <input
                className="mgr-field"
                name="surname"
                value={createForm.surname}
                onChange={updateCreateField}
                placeholder={t("manager.accounts.form.placeholderSurname")}
              />

              <input
                className="mgr-field"
                name="middle_name"
                value={createForm.middle_name}
                onChange={updateCreateField}
                placeholder={t("manager.accounts.form.placeholderMiddleName")}
              />

              <input
                className="mgr-field"
                name="first_name"
                value={createForm.first_name}
                onChange={updateCreateField}
                placeholder={t("manager.accounts.form.placeholderFirstName")}
                required
              />

              <select
                className="mgr-field"
                name="gender"
                value={createForm.gender}
                onChange={updateCreateField}
              >
                <option value="1">{t("manager.accounts.form.genderMale")}</option>
                <option value="2">{t("manager.accounts.form.genderFemale")}</option>
                <option value="">{t("manager.accounts.form.genderUnknown")}</option>
              </select>

              <input
                className="mgr-field"
                name="generation"
                type="number"
                min="1"
                value={createForm.generation}
                onChange={updateCreateField}
                placeholder={t("manager.accounts.form.placeholderGeneration")}
              />

              <div className="mgr-dateField">
                <DateInput
                  className="mgr-field"
                  name="birth_date"
                  value={createForm.birth_date}
                  onChange={updateCreateField}
                />
                <LunarDateHint value={createForm.birth_date} label={t("manager.accounts.form.placeholderBirthDate") + " (L)"} />
              </div>

              <input
                className="mgr-field member-pro-full"
                name="hometown"
                value={createForm.hometown}
                onChange={updateCreateField}
                placeholder={t("manager.accounts.form.placeholderHometown")}
              />

              {isAdmin && (
                <input
                  className="mgr-field"
                  name="clan_id"
                  type="number"
                  value={createForm.clan_id}
                  onChange={updateCreateField}
                  placeholder="clan_id"
                />
              )}
            </div>

            <div className="mgr-modalActions">
              <button className="mgr-btnPrimary" type="submit" disabled={saving}>
                {saving ? t("manager.accounts.actions.saving") : t("manager.accounts.actions.addMember")}
              </button>

              <button className="mgr-btnGhost" type="button" onClick={() => setCreateOpen(false)} disabled={saving}>
                {t("common.close")}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="member-pro-main-panel">
        <div className="member-pro-toolbar">
          <div>
            <h3>{t("manager.accounts.list.title")}</h3>
            <p dangerouslySetInnerHTML={{ 
              __html: t("manager.accounts.list.showing", { count: filteredMembers.length, total: members.length }) 
            }} />
          </div>

          <div className="member-pro-toolbar-actions">
            <button
              className="member-pro-btn member-pro-btn-light"
              type="button"
              onClick={() => setRelationOpen((value) => !value)}
            >
              <span className="material-symbols-outlined">account_tree</span>
              {t("manager.accounts.actions.linkRelations")}
            </button>
          </div>
        </div>

        <div className="member-pro-filter-grid">
          <input
            className="mgr-field"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("common.search") + "..."}
          />

          <select
            className="mgr-field"
            value={genderFilter}
            onChange={(e) => setGenderFilter(e.target.value)}
          >
            <option value="">{t("common.all") + " " + t("manager.accounts.form.placeholderGender").toLowerCase()}</option>
            <option value="1">{t("manager.accounts.form.genderMale")}</option>
            <option value="2">{t("manager.accounts.form.genderFemale")}</option>
          </select>

          <select
            className="mgr-field"
            value={livingFilter}
            onChange={(e) => setLivingFilter(e.target.value)}
          >
            <option value="">{t("common.all") + " " + t("manager.accounts.form.livingStatus").toLowerCase()}</option>
            <option value="living">{t("manager.accounts.form.statusLiving")}</option>
            <option value="dead">{t("manager.accounts.form.statusDead")}</option>
          </select>

          <select
            className="mgr-field"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">{t("common.all") + " " + t("common.status.title").toLowerCase()}</option>
            <option value="active">{t("common.status.active")}</option>
            <option value="pending">{t("common.status.pending")}</option>
            <option value="rejected">{t("common.status.rejected")}</option>
            <option value="no_account">Chưa có tài khoản</option>
          </select>

          <select
            className="mgr-field"
            value={generationFilter}
            onChange={(e) => setGenerationFilter(e.target.value)}
          >
            <option value="">{t("common.all") + " " + t("manager.accounts.form.placeholderGeneration").toLowerCase()}</option>
            {generationOptions.map((generation) => (
              <option key={generation} value={generation}>
                {t("manager.accounts.form.placeholderGeneration")} {generation}
              </option>
            ))}
          </select>
        </div>

        <div className="member-pro-table">
          <div className="member-pro-table-head">
            <span>{t("common.member")}</span>
            <span>{t("manager.accounts.form.placeholderGeneration")} / {t("manager.accounts.form.branch")}</span>
            <span>{t("common.status.title")}</span>
            <span>{t("common.hometown")}</span>
            <span>{t("common.actions")}</span>
          </div>

          <div className="member-pro-table-body">
            {loading ? (
              <div className="mgr-empty">{t("common.loading")}</div>
            ) : filteredMembers.length ? (
              filteredMembers.map((member) => (
                <div className="member-pro-row" key={member.account_id || `person-${member.person_id}`}>
                  <div className="member-pro-person">
                    <div className="member-pro-avatar">
                      {fullName(member).charAt(0).toUpperCase() || "T"}
                    </div>

                    <div>
                      <strong>{fullName(member)}</strong>
                      <span>{member.email || "Chưa có tài khoản"}</span>
                      <small>ID: {member.person_id || member.account_id}</small>
                    </div>
                  </div>

                  <div className="member-pro-meta">
                    <strong>{t("manager.accounts.form.placeholderGeneration")} {member.generation || "?"}</strong>
                    <span>{t("manager.accounts.form.branch")} {member.branch || "?"}</span>
                  </div>

                  <div className="member-pro-status-stack">
                    <span className={`member-pro-pill ${member.status || "unknown"}`}>
                      {getStatusLabel(member.status)}
                    </span>
                    <span className="member-pro-soft-pill">
                      {getGenderLabel(member.gender)} · {getLivingLabel(member)}
                    </span>
                  </div>

                  <div className="member-pro-hometown">
                    {member.hometown || t("manager.accounts.form.noInfo")}
                  </div>

                  <div className="member-pro-actions">
                    {member.account_id ? (
                      <button
                        className="mgr-btnGhost"
                        type="button"
                        onClick={() => openEdit(member.account_id)}
                      >
                        {t("common.edit")}
                      </button>
                    ) : (
                      <span className="member-pro-no-account">Chỉ có hồ sơ</span>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="mgr-empty">{t("manager.accounts.messages.empty") || "No members found."}</div>
            )}
          </div>
        </div>
      </div>

      {editAccountId && (
        <div
          className="mgr-modalOverlay"
          role="presentation"
          onClick={() => !saving && setEditAccountId(null)}
        >
          <div
            className="mgr-modal member-pro-modal"
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              className="mgr-modalClose"
              type="button"
              onClick={() => setEditAccountId(null)}
              disabled={saving}
            >
              ×
            </button>

            <h2 className="mgr-modalTitle">{t("manager.accounts.form.editTitle")} #{editAccountId}</h2>
            <p className="mgr-modalMeta">{t("manager.accounts.form.editDescription") || "Update account and profile info."}</p>

            <div className="mgr-overviewFormGrid mgr-modalGrid">
              <input className="mgr-field" name="email" type="email" value={editForm.email} onChange={updateEditField} placeholder={t("manager.accounts.form.placeholderEmail")} />

              <select className="mgr-field" name="status" value={editForm.status} onChange={updateEditField}>
                <option value="active">{t("common.status.active")}</option>
                <option value="pending">{t("common.status.pending")}</option>
                <option value="rejected">{t("common.status.rejected")}</option>
              </select>

              {canAssignManager && (
                <select className="mgr-field" name="role_id" value={editForm.role_id} onChange={updateEditField}>
                  <option value="3">Member</option>
                  <option value="2">Manager</option>
                </select>
              )}

              <input className="mgr-field" name="new_password" type="password" value={editForm.new_password} onChange={updateEditField} placeholder={t("manager.accounts.form.placeholderPassword") + " (optional)"} />
              <input className="mgr-field" name="surname" value={editForm.surname} onChange={updateEditField} placeholder={t("manager.accounts.form.placeholderSurname")} />
              <input className="mgr-field" name="middle_name" value={editForm.middle_name} onChange={updateEditField} placeholder={t("manager.accounts.form.placeholderMiddleName")} />
              <input className="mgr-field" name="first_name" value={editForm.first_name} onChange={updateEditField} placeholder={t("manager.accounts.form.placeholderFirstName")} />

              <select className="mgr-field" name="gender" value={editForm.gender} onChange={updateEditField}>
                <option value="1">{t("manager.accounts.form.genderMale")}</option>
                <option value="2">{t("manager.accounts.form.genderFemale")}</option>
                <option value="">{t("manager.accounts.form.genderUnknown")}</option>
              </select>

              <div className="mgr-dateField">
                <DateInput className="mgr-field" name="birth_date" value={editForm.birth_date} onChange={updateEditField} />
                <LunarDateHint value={editForm.birth_date} label={t("manager.accounts.form.placeholderBirthDate") + " (L)"} />
              </div>

              <div className="mgr-dateField">
                <DateInput className="mgr-field" name="death_date" value={editForm.death_date} onChange={updateEditField} disabled={editForm.is_living === "1"} />
                <LunarDateHint value={editForm.death_date} label={t("manager.accounts.form.placeholderDeathDate") + " (L)"} />
              </div>

              <select className="mgr-field" name="is_living" value={editForm.is_living} onChange={updateEditField}>
                <option value="1">{t("manager.accounts.form.statusLiving")}</option>
                <option value="0">{t("manager.accounts.form.statusDead")}</option>
              </select>

              <input className="mgr-field" name="generation" type="number" min="1" value={editForm.generation} onChange={updateEditField} placeholder={t("manager.accounts.form.placeholderGeneration")} />
              <input className="mgr-field" name="branch" type="number" value={editForm.branch} onChange={updateEditField} placeholder={t("manager.accounts.form.branch")} />
              <input className="mgr-field" name="hometown" value={editForm.hometown} onChange={updateEditField} placeholder={t("manager.accounts.form.placeholderHometown")} />
              <input className="mgr-field" name="phone" value={editForm.phone} onChange={updateEditField} placeholder={t("common.phone")} />
              <input className="mgr-field" name="people_email" type="email" value={editForm.people_email} onChange={updateEditField} placeholder={t("common.email") + " (alt)"} />
              <input className="mgr-field" name="address" value={editForm.address} onChange={updateEditField} placeholder={t("common.address") || "Address"} />
              <input className="mgr-field" name="avatar_url" value={editForm.avatar_url} onChange={updateEditField} placeholder="Avatar URL" />
              <textarea className="mgr-field mgr-fieldTextarea" name="bio" value={editForm.bio} onChange={updateEditField} placeholder="Bio" />
              <textarea className="mgr-field mgr-fieldTextarea" name="note" value={editForm.note} onChange={updateEditField} placeholder={t("manager.accounts.form.note")} />
            </div>

            <div className="mgr-modalActions">
              <button className="mgr-btnPrimary" type="button" onClick={saveEdit} disabled={saving}>
                {saving ? t("manager.accounts.actions.saving") : t("common.saveChanges")}
              </button>

              <button className="mgr-btnGhost" type="button" onClick={() => setEditAccountId(null)} disabled={saving}>
                {t("common.close")}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

import { useEffect, useState } from "react";
import DateInput from "../../../../shared/components/DateInput";
import { useLanguage } from "../../../../i18n/LanguageContext";
import { fullName, personToForm } from "../../utils/tree-editor/treePersonUtils";
import LunarDateHint from "./LunarDateHint";
import ImageUpload from "../../../../shared/components/ImageUpload";

export default function PersonInspector({
  person,
  spouse,
  onClose,
  onSave,
  onDelete,
  onCreateRelation,
  saving,
  canEdit = false,
  canEditRole = false,
  canEditRelations = false,
  canDelete = false,
  notice = "",
}) {
  const { t } = useLanguage();
  const [form, setForm] = useState(() => personToForm(person));

  useEffect(() => {
    setForm(personToForm(person));
  }, [person?.id]);

  if (!person) {
    return null;
  }

  const setField = (field, value) =>
    setForm((current) => {
      if (field === "is_living" && value === "1") {
        return { ...current, is_living: value, death_date: "" };
      }
      return { ...current, [field]: value };
    });

  const handleFullNameChange = (e) => {
    const fullNameValue = e.target.value;
    const parts = fullNameValue.trim().split(/\s+/);

    let surname = "";
    let middle_name = "";
    let first_name = "";

    if (parts.length === 1 && parts[0] !== "") {
      first_name = parts[0];
    } else if (parts.length === 2) {
      surname = parts[0];
      first_name = parts[1];
    } else if (parts.length >= 3) {
      surname = parts[0];
      first_name = parts[parts.length - 1];
      middle_name = parts.slice(1, parts.length - 1).join(" ");
    }

    setForm((current) => ({
      ...current,
      display_name: fullNameValue,
      surname,
      middle_name,
      first_name,
    }));
  };

  return (
    <div className="fte-modalOverlay fte-inspectorOverlay" role="presentation" onMouseDown={onClose}>
      <aside className="fte-inspector" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
        <div className="fte-inspectorHeader">
          <div>
            <span>{t("tree.inspector.title")}</span>
            <h3>{fullName(person, t("tree.card.fallbackName"))}</h3>
            <p>{spouse ? t("tree.inspector.spouseLabel", { name: fullName(spouse) }) : t("tree.inspector.fallbackSubtitle")}</p>
          </div>
          <button type="button" className="fte-iconButton" onClick={onClose} title={t("tree.inspector.closePanel")}>
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {canEditRelations ? (
          <div className="fte-inspectorActions">
            <button type="button" onClick={() => onCreateRelation("spouse")}>
              <span className="material-symbols-outlined">favorite</span>
              {t("tree.inspector.actions.addSpouse")}
            </button>
            <button type="button" onClick={() => onCreateRelation("child")}>
              <span className="material-symbols-outlined">person_add</span>
              {t("tree.inspector.actions.addChild")}
            </button>
            <button type="button" onClick={() => onCreateRelation("father")}>
              <span className="material-symbols-outlined">man</span>
              {t("tree.inspector.actions.addFather")}
            </button>
            <button type="button" onClick={() => onCreateRelation("mother")}>
              <span className="material-symbols-outlined">woman</span>
              {t("tree.inspector.actions.addMother")}
            </button>
          </div>
        ) : null}

        {notice ? <div className="fte-readOnlyNote">{notice}</div> : null}

        <div className="fte-formGrid">
          <label>
            {t("tree.inspector.fields.displayName")}
            <input value={form.display_name} onChange={handleFullNameChange} disabled={!canEdit} />
          </label>

          <label>
            {t("tree.inspector.fields.surname")}
            <input value={form.surname} onChange={(event) => setField("surname", event.target.value)} disabled={!canEdit} />
          </label>

          <label>
            {t("tree.inspector.fields.middleName")}
            <input value={form.middle_name} onChange={(event) => setField("middle_name", event.target.value)} disabled={!canEdit} />
          </label>

          <label>
            {t("tree.inspector.fields.firstName")}
            <input value={form.first_name} onChange={(event) => setField("first_name", event.target.value)} disabled={!canEdit} />
          </label>

          <label>
            {t("tree.inspector.fields.gender")}
            <select value={form.gender} onChange={(event) => setField("gender", event.target.value)} disabled={!canEdit}>
              <option value="">{t("tree.inspector.fields.genderOptions.unknown")}</option>
              <option value="1">{t("tree.inspector.fields.genderOptions.male")}</option>
              <option value="2">{t("tree.inspector.fields.genderOptions.female")}</option>
            </select>
          </label>

          <label>
            {t("tree.inspector.fields.role")}
            <select
              value={form.role_id}
              onChange={(event) => setField("role_id", event.target.value)}
              disabled={!canEditRole || !person.account_id}
            >
              <option value="">{t("tree.inspector.fields.roleOptions.noAccount")}</option>
              <option value="2">{t("tree.inspector.fields.roleOptions.chief")}</option>
              <option value="3">{t("tree.inspector.fields.roleOptions.member")}</option>
            </select>
          </label>

          <label>
            {t("tree.inspector.fields.status")}
            <select value={form.is_living} onChange={(event) => setField("is_living", event.target.value)} disabled={!canEdit}>
              <option value="1">{t("tree.inspector.fields.statusOptions.living")}</option>
              <option value="0">{t("tree.inspector.fields.statusOptions.deceased")}</option>
            </select>
          </label>

          <label>
            {t("tree.inspector.fields.birthDate")}
            <DateInput
              value={form.birth_date}
              onChange={(event) => setField("birth_date", event.target.value)}
              disabled={!canEdit}
            />
            <LunarDateHint value={form.birth_date} label={t("tree.inspector.fields.lunarBirth")} />
          </label>

          <label>
            {t("tree.inspector.fields.deathDate")}
            <DateInput
              value={form.death_date}
              onChange={(event) => setField("death_date", event.target.value)}
              disabled={!canEdit || form.is_living === "1"}
            />
            <LunarDateHint value={form.death_date} label={t("tree.inspector.fields.lunarDeath")} />
          </label>

          <label>
            {t("tree.inspector.fields.generation")}
            <input
              type="number"
              min="1"
              value={form.generation}
              onChange={(event) => setField("generation", event.target.value)}
              disabled={!canEdit}
            />
          </label>

          <label>
            {t("tree.inspector.fields.branch")}
            <input value={form.branch} onChange={(event) => setField("branch", event.target.value)} disabled={!canEdit} />
          </label>

          <label className="is-wide">
            {t("tree.inspector.fields.hometown")}
            <input value={form.hometown} onChange={(event) => setField("hometown", event.target.value)} disabled={!canEdit} />
          </label>

          <label className="is-wide">
            {t("tree.inspector.fields.address")}
            <input value={form.address} onChange={(event) => setField("address", event.target.value)} disabled={!canEdit} />
          </label>

          <label>
            {t("tree.inspector.fields.phone")}
            <input value={form.phone} onChange={(event) => setField("phone", event.target.value)} disabled={!canEdit} />
          </label>

          <label>
            {t("tree.inspector.fields.email")}
            <input type="email" value={form.email} onChange={(event) => setField("email", event.target.value)} disabled={!canEdit} />
          </label>

          <div className="fte-fieldGroup is-wide">
            <span className="fte-fieldLabel">{t("tree.inspector.fields.avatarUrl")}</span>
            <ImageUpload
              value={form.avatar_url}
              onUploadSuccess={(url) => setField("avatar_url", url)}
              disabled={!canEdit}
              usageType="avatar"
            />
          </div>

          <label className="is-wide">
            {t("tree.inspector.fields.bio")}
            <textarea rows={3} value={form.bio} onChange={(event) => setField("bio", event.target.value)} disabled={!canEdit} />
          </label>

          <label className="is-wide">
            {t("tree.inspector.fields.note")}
            <textarea rows={2} value={form.note} onChange={(event) => setField("note", event.target.value)} disabled={!canEdit} />
          </label>
        </div>

        {canEdit ? (
          <div className="fte-inspectorFooter">
            <button type="button" className="fte-primaryButton" disabled={saving} onClick={() => onSave(form)}>
              <span className="material-symbols-outlined">save</span>
              {saving ? t("tree.inspector.actions.saving") : t("tree.inspector.actions.save")}
            </button>

            {canDelete ? (
              <button type="button" className="fte-dangerButton" disabled={saving} onClick={onDelete}>
                <span className="material-symbols-outlined">delete</span>
                {t("tree.inspector.actions.delete")}
              </button>
            ) : null}
          </div>
        ) : null}
      </aside>
    </div>
  );
}

import DateInput from "../../../../shared/components/DateInput";
import { useLanguage } from "../../../../i18n/LanguageContext";
import { fullName } from "../../utils/tree-editor/treePersonUtils";
import LunarDateHint from "./LunarDateHint";
import ImageUpload from "../../../../shared/components/ImageUpload";

export default function CreatePersonDialog({ relation, form, selectedPerson, onChange, onCancel, onSubmit, saving }) {
  const { t } = useLanguage();
  if (!relation || !form) return null;

  const titleMap = {
    person: t("tree.createModal.titles.person"),
    spouse: t("tree.createModal.titles.spouse"),
    child: t("tree.createModal.titles.child"),
    father: t("tree.createModal.titles.father"),
    mother: t("tree.createModal.titles.mother"),
  };

  const relationTextMap = {
    spouse: t("tree.relations.spouse"),
    child: t("tree.relations.child"),
    father: t("tree.relations.father"),
    mother: t("tree.relations.mother"),
  };

  const dialogTitle =
    relation !== "person" && selectedPerson
      ? t("tree.createModal.titles.for", { title: t(`tree.createModal.titles.${relation}`), name: fullName(selectedPerson, t("tree.card.fallbackName")) })
      : t(`tree.createModal.titles.${relation}`) || t("tree.createModal.titles.person");

  const setField = (field, value) => {
    if (field === "is_living" && value === "1") {
      onChange({
        ...form,
        is_living: value,
        death_date: "",
      });
      return;
    }

    if (field === "is_living" && value === "0") {
      onChange({
        ...form,
        is_living: value,
        account_email: "",
        account_password: "",
      });
      return;
    }

    onChange({
      ...form,
      [field]: value,
    });
  };

  const handleFullNameChange = (event) => {
    const fullNameValue = event.target.value;
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

    onChange({
      ...form,
      display_name: fullNameValue,
      surname,
      middle_name,
      first_name,
    });
  };

  return (
    <div className="fte-modalOverlay" role="presentation" onMouseDown={onCancel}>
      <div className="fte-modal" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
        <div className="fte-modalHeader">
          <div>
            <span>
              {relation !== "person" && selectedPerson
                ? t("tree.createModal.titles.new", { relation: t(`tree.relations.${relation}`) })
                : t("tree.title")}
            </span>
            <h3>{dialogTitle}</h3>
          </div>

          <button type="button" className="fte-iconButton" onClick={onCancel} title={t("common.close")}>
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="fte-formGrid fte-formGrid--modal">
          <label className="is-wide">
            {t("tree.inspector.fields.displayName")}
            <input
              autoFocus
              value={form.display_name || ""}
              onChange={handleFullNameChange}
              placeholder={t("tree.createModal.fields.displayPlaceholder")}
            />
          </label>

          <label>
            {t("tree.inspector.fields.surname")}
            <input
              value={form.surname || ""}
              onChange={(event) => setField("surname", event.target.value)}
            />
          </label>

          <label>
            {t("tree.inspector.fields.middleName")}
            <input
              value={form.middle_name || ""}
              onChange={(event) => setField("middle_name", event.target.value)}
            />
          </label>

          <label>
            {t("tree.inspector.fields.firstName")}
            <input
              value={form.first_name || ""}
              onChange={(event) => setField("first_name", event.target.value)}
            />
          </label>

          <label>
            {t("tree.inspector.fields.gender")}
            <select value={form.gender || ""} onChange={(event) => setField("gender", event.target.value)}>
              <option value="1">{t("tree.inspector.fields.genderOptions.male")}</option>
              <option value="2">{t("tree.inspector.fields.genderOptions.female")}</option>
              <option value="">{t("tree.inspector.fields.genderOptions.unknown")}</option>
            </select>
          </label>

          <label>
            {t("tree.inspector.fields.generation")}
            <input
              type="number"
              min="1"
              value={form.generation || "1"}
              onChange={(event) => setField("generation", event.target.value)}
            />
          </label>

          <label>
            {t("tree.inspector.fields.status")}
            <select value={form.is_living || "1"} onChange={(event) => setField("is_living", event.target.value)}>
              <option value="1">{t("tree.inspector.fields.statusOptions.living")}</option>
              <option value="0">{t("tree.inspector.fields.statusOptions.deceased")}</option>
            </select>
          </label>

          {form.is_living === "1" ? (
            <div className="fte-accountCreateBox is-wide">
              <div className="fte-accountCreateTitle">
                <span className="material-symbols-outlined">manage_accounts</span>
                {t("tree.createModal.fields.accountBoxTitle")}
              </div>

              <label>
                {t("tree.createModal.fields.accountEmail")}
                <input
                  type="email"
                  value={form.account_email || ""}
                  onChange={(event) => setField("account_email", event.target.value)}
                  placeholder="example@gmail.com"
                  autoComplete="new-email"
                />
              </label>

              <label>
                {t("tree.createModal.fields.accountPassword")}
                <input
                  type="password"
                  value={form.account_password || ""}
                  onChange={(event) => setField("account_password", event.target.value)}
                  placeholder={t("tree.createModal.fields.passwordHint")}
                  autoComplete="new-password"
                />
              </label>
            </div>
          ) : null}

          <label>
            {t("tree.inspector.fields.birthDate")}
            <DateInput
              value={form.birth_date || ""}
              onChange={(event) => setField("birth_date", event.target.value)}
            />
            <LunarDateHint value={form.birth_date} label={t("tree.inspector.fields.lunarBirth")} />
          </label>

          <label>
            {t("tree.inspector.fields.deathDate")}
            <DateInput
              value={form.death_date || ""}
              onChange={(event) => setField("death_date", event.target.value)}
              disabled={form.is_living === "1"}
            />
            <LunarDateHint value={form.death_date} label={t("tree.inspector.fields.lunarDeath")} />
          </label>

          <label className="is-wide">
            {t("tree.inspector.fields.hometown")}
            <input
              value={form.hometown || ""}
              onChange={(event) => setField("hometown", event.target.value)}
            />
          </label>

          <div className="fte-fieldGroup is-wide">
            <span className="fte-fieldLabel">{t("tree.inspector.fields.avatarUrl")}</span>
            <ImageUpload
              value={form.avatar_url || ""}
              onUploadSuccess={(url) => setField("avatar_url", url)}
              disabled={saving}
              usageType="avatar"
            />
          </div>
        </div>

        <div className="fte-modalFooter">
          <button type="button" className="fte-primaryButton" disabled={saving} onClick={onSubmit}>
            <span className="material-symbols-outlined">person_add</span>
            {saving ? t("tree.createModal.actions.creating") : t("tree.createModal.actions.create")}
          </button>

          <button type="button" className="fte-ghostButton" disabled={saving} onClick={onCancel}>
            {t("common.cancel")}
          </button>
        </div>
      </div>
    </div>
  );
}

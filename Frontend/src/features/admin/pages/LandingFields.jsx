import ImageUpload from "../../../shared/components/ImageUpload";
import { fieldError, maxLengthOf } from "./landingAdminConfig";

// Gợi ý mặc định theo loại trường (khóa i18n đầy đủ).
const DEFAULT_HINT = {
  link: "admin.landing.linkHint",
  https: "admin.landing.hints.httpsLink",
  video: "admin.landing.hints.videoUrl",
  icon: "admin.landing.iconHint",
};
const PLACEHOLDER = {
  link: "/clan-register  |  https://...",
  https: "https://...",
  video: "https://www.youtube.com/watch?v=...",
  icon: "bolt",
};

// Một trường của form mục/mục con. Trường chữ luôn hai cột Việt - Anh.
export default function LandingField({ field, draft, onChange, labelPrefix, isSection, t }) {
  const label = t(`admin.landing.fields.${field.labelKey || field.name}`);
  const idBase = `${labelPrefix}-${field.name}`;
  const customHint = field.hintKey ? t(`admin.landing.hints.${field.hintKey}`) : null;

  if (field.kind === "image") {
    return (
      <div className="landing-field landing-field-wide">
        <span className="landing-field-label">{label}</span>
        <ImageUpload
          value={draft[field.name] || ""}
          usageType="other"
          crop={false}
          label={t("admin.landing.uploadImage")}
          onUploadSuccess={(url) => onChange(field.name, url)}
        />
        <small className="landing-hint">{t("admin.landing.imageHint")}</small>
      </div>
    );
  }

  if (field.kind === "select") {
    return (
      <div className="landing-field landing-field-wide">
        <label htmlFor={idBase} className="landing-field-label">{label}</label>
        <select id={idBase} value={draft[field.name] || ""} onChange={(event) => onChange(field.name, event.target.value)}>
          <option value="">{t("admin.landing.selectNone")}</option>
          {field.options.map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
        {customHint && <small className="landing-hint">{customHint}</small>}
      </div>
    );
  }

  if (field.kind in DEFAULT_HINT) {
    const errorCode = fieldError(field, draft[field.name]);
    return (
      <div className="landing-field landing-field-wide">
        <label htmlFor={idBase} className="landing-field-label">{label}</label>
        <input
          id={idBase}
          type="text"
          value={draft[field.name] || ""}
          maxLength={field.kind === "icon" ? 60 : 1000}
          placeholder={PLACEHOLDER[field.kind]}
          aria-invalid={errorCode ? "true" : undefined}
          onChange={(event) => onChange(field.name, event.target.value)}
        />
        <small className="landing-hint">{customHint || t(DEFAULT_HINT[field.kind])}</small>
        {errorCode && <small className="landing-hint is-error" role="alert">{t(`admin.landing.errors.${errorCode}`)}</small>}
      </div>
    );
  }

  const max = maxLengthOf(field, isSection);
  return (
    <div className="landing-field landing-field-wide landing-bilingual">
      {["vi", "en"].map((lang) => {
        const name = `${field.name}_${lang}`;
        const id = `${idBase}-${lang}`;
        return (
          <div key={lang} className="landing-bilingual-col">
            <label htmlFor={id} className="landing-field-label">
              {label} <span className="landing-lang">{t(`admin.landing.lang.${lang}`)}</span>
            </label>
            {field.kind === "area" ? (
              <textarea id={id} rows={field.rows || 3} value={draft[name] || ""} maxLength={max} onChange={(event) => onChange(name, event.target.value)} />
            ) : (
              <input id={id} type="text" value={draft[name] || ""} maxLength={max} onChange={(event) => onChange(name, event.target.value)} />
            )}
          </div>
        );
      })}
      {customHint && <small className="landing-hint landing-bilingual-hint">{customHint}</small>}
    </div>
  );
}

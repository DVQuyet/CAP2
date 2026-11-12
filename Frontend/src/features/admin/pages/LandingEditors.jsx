import { useState } from "react";
import LandingField from "./LandingFields";
import { ITEM_FIELDS, SECTION_FIELDS, firstFieldError, itemDraftOf, sectionDraftOf } from "./landingAdminConfig";

// Form thêm/sửa một mục con.
export function ItemEditor({ sectionKey, initial, busy, onSave, onCancel, t }) {
  const [draft, setDraft] = useState(() => itemDraftOf(initial, sectionKey));
  const fields = ITEM_FIELDS[sectionKey] || [];
  const hasError = Boolean(firstFieldError(fields, draft));
  const change = (name, value) => setDraft((prev) => ({ ...prev, [name]: value }));

  return (
    <form
      className="landing-item-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (!hasError) onSave(draft);
      }}
    >
      {fields.map((field) => (
        <LandingField key={field.name} field={field} draft={draft} onChange={change} labelPrefix={`item-${initial?.id || "new"}`} t={t} />
      ))}
      <label className="landing-switch">
        <input type="checkbox" checked={draft.is_visible !== false} onChange={(event) => change("is_visible", event.target.checked)} />
        <span>{t("admin.landing.visibleItem")}</span>
      </label>
      <div className="landing-actions">
        <button type="submit" className="landing-btn is-primary" disabled={busy || hasError}>
          {busy ? t("common.saving") : t("common.save")}
        </button>
        <button type="button" className="landing-btn" onClick={onCancel} disabled={busy}>{t("common.cancel")}</button>
      </div>
    </form>
  );
}

// Form chữ cấp mục.
export function SectionForm({ sectionKey, section, busy, onSave, t }) {
  const [draft, setDraft] = useState(() => sectionDraftOf(section));
  const fields = SECTION_FIELDS[sectionKey] || [];
  const hasError = Boolean(firstFieldError(fields, draft));
  const change = (name, value) => setDraft((prev) => ({ ...prev, [name]: value }));

  return (
    <form
      className="landing-card"
      onSubmit={(event) => {
        event.preventDefault();
        if (!hasError) onSave(draft);
      }}
    >
      {fields.map((field) => (
        <LandingField key={field.name} field={field} draft={draft} onChange={change} labelPrefix={`section-${sectionKey}`} isSection t={t} />
      ))}
      <div className="landing-actions">
        <button type="submit" className="landing-btn is-primary" disabled={busy || hasError}>
          {busy ? t("common.saving") : t("admin.landing.saveSection")}
        </button>
      </div>
    </form>
  );
}

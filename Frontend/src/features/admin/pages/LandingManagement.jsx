import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  getAdminLanding,
  updateLandingSection,
  reorderLandingSections,
  resetLandingSection,
  createLandingItem,
  updateLandingItem,
  deleteLandingItem,
  reorderLandingItems,
  seedLanding,
} from "../../../api/landingService";
import { useConfirm } from "../../../shared/components/confirmContext.js";
import ImageUpload from "../../../shared/components/ImageUpload";
import ErrorState from "../../../shared/components/ErrorState";
import LoadingState from "../../../shared/components/LoadingState";
import { friendlyErrorMessage } from "../../../shared/utils/friendlyError";
import { clearLandingCache } from "../../public/landing/useLandingContent";
import { LANDING_KEYS, buildSeedPayload, makeTranslator, isSafeLink } from "../../public/landing/landingContent";
import "./LandingManagement.css";

// Trường chữ cấp mục cho từng mục. kind: text | area (xuống dòng được) | image.
const SECTION_FIELDS = {
  hero: [{ name: "title", kind: "area", rows: 3 }, { name: "body", kind: "area", rows: 3 }, { name: "image_url", kind: "image" }],
  about: [{ name: "tag", kind: "text" }, { name: "title", kind: "text" }, { name: "body", kind: "area", rows: 7 }, { name: "quote", kind: "area", rows: 2 }, { name: "image_url", kind: "image" }],
  features: [{ name: "tag", kind: "text" }, { name: "title", kind: "text" }, { name: "image_url", kind: "image" }],
  stats: [],
  news: [],
  guide: [],
};
const ITEM_FIELDS = {
  hero: [{ name: "link_label", kind: "text" }, { name: "link_url", kind: "link" }],
  features: [{ name: "icon", kind: "icon" }, { name: "title", kind: "text" }, { name: "body", kind: "area", rows: 3 }],
  stats: [{ name: "meta", kind: "text", labelKey: "metaStats" }, { name: "title", kind: "text", labelKey: "statLabel" }],
  news: [{ name: "meta", kind: "text", labelKey: "metaNews" }, { name: "title", kind: "text" }, { name: "body", kind: "area", rows: 4 }, { name: "image_url", kind: "image" }, { name: "link_url", kind: "link" }, { name: "link_label", kind: "text" }],
  guide: [{ name: "icon", kind: "icon" }, { name: "title", kind: "text" }, { name: "body", kind: "area", rows: 3 }],
};
const MAX = { tag: 255, title: 500, body: 3000, quote: 1000, meta: 255, link_label: 255 };
const SECTION_BODY_MAX = 5000;

const emptyItem = (key) => {
  const draft = { is_visible: true, icon: "", image_url: "", link_url: "" };
  for (const field of ["title", "body", "meta", "link_label"]) {
    draft[`${field}_vi`] = "";
    draft[`${field}_en`] = "";
  }
  if (key === "hero") draft.link_url = "";
  return draft;
};

const sectionDraftOf = (section) => {
  const draft = { image_url: section?.image_url || "" };
  for (const field of ["tag", "title", "body", "quote"]) {
    draft[`${field}_vi`] = section?.[`${field}_vi`] || "";
    draft[`${field}_en`] = section?.[`${field}_en`] || "";
  }
  return draft;
};

const itemDraftOf = (item) => ({ ...emptyItem(), ...item });

function Field({ field, draft, onChange, labelPrefix, t }) {
  const label = t(`admin.landing.fields.${field.labelKey || field.name}`);
  const idBase = `${labelPrefix}-${field.name}`;

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

  if (field.kind === "link" || field.kind === "icon") {
    const invalid = field.kind === "link" && draft[field.name] && !isSafeLink(draft[field.name]);
    return (
      <div className="landing-field landing-field-wide">
        <label htmlFor={idBase} className="landing-field-label">{label}</label>
        <input
          id={idBase}
          type="text"
          value={draft[field.name] || ""}
          maxLength={field.kind === "icon" ? 60 : 1000}
          placeholder={field.kind === "link" ? "/clan-register  |  https://..." : "bolt"}
          aria-invalid={invalid ? "true" : undefined}
          onChange={(event) => onChange(field.name, event.target.value)}
        />
        <small className={`landing-hint ${invalid ? "is-error" : ""}`}>
          {field.kind === "link" ? t("admin.landing.linkHint") : t("admin.landing.iconHint")}
        </small>
      </div>
    );
  }

  const max = field.name === "body" && field.kind === "area" && draft.__section ? SECTION_BODY_MAX : MAX[field.name];
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
    </div>
  );
}

function ItemEditor({ sectionKey, initial, busy, onSave, onCancel, t }) {
  const [draft, setDraft] = useState(() => itemDraftOf(initial));
  const fields = ITEM_FIELDS[sectionKey] || [];
  const hasBadLink = draft.link_url && !isSafeLink(draft.link_url);
  const change = (name, value) => setDraft((prev) => ({ ...prev, [name]: value }));

  return (
    <form
      className="landing-item-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (!hasBadLink) onSave(draft);
      }}
    >
      {fields.map((field) => (
        <Field key={field.name} field={field} draft={draft} onChange={change} labelPrefix={`item-${initial?.id || "new"}`} t={t} />
      ))}
      <label className="landing-switch">
        <input type="checkbox" checked={draft.is_visible !== false} onChange={(event) => change("is_visible", event.target.checked)} />
        <span>{t("admin.landing.visibleItem")}</span>
      </label>
      <div className="landing-actions">
        <button type="submit" className="landing-btn is-primary" disabled={busy || hasBadLink}>
          {busy ? t("common.saving") : t("common.save")}
        </button>
        <button type="button" className="landing-btn" onClick={onCancel} disabled={busy}>{t("common.cancel")}</button>
      </div>
    </form>
  );
}

function SectionForm({ sectionKey, section, busy, onSave, t }) {
  const [draft, setDraft] = useState(() => sectionDraftOf(section));
  const fields = SECTION_FIELDS[sectionKey] || [];
  const badLink = draft.image_url && !isSafeLink(draft.image_url);
  const change = (name, value) => setDraft((prev) => ({ ...prev, [name]: value }));

  return (
    <form
      className="landing-card"
      onSubmit={(event) => {
        event.preventDefault();
        if (!badLink) onSave(draft);
      }}
    >
      {fields.map((field) => (
        <Field key={field.name} field={field} draft={{ ...draft, __section: true }} onChange={change} labelPrefix={`section-${sectionKey}`} t={t} />
      ))}
      <div className="landing-actions">
        <button type="submit" className="landing-btn is-primary" disabled={busy || badLink}>
          {busy ? t("common.saving") : t("admin.landing.saveSection")}
        </button>
      </div>
    </form>
  );
}

function itemSummary(item, key) {
  const title = item.title_vi || item.title_en || item.link_label_vi || item.link_label_en || "";
  const meta = item.meta_vi || item.meta_en || "";
  if (key === "stats") return [meta, title].filter(Boolean).join(" — ");
  return title || meta;
}

export default function LandingManagement() {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const [data, setData] = useState({ sections: [], tableMissing: false });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [activeKey, setActiveKey] = useState("hero");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(null); // { type: "ok" | "error", text }
  const [editing, setEditing] = useState(null); // "new" | id mục con đang sửa

  const byKey = useMemo(() => Object.fromEntries(data.sections.map((s) => [s.section_key, s])), [data.sections]);
  const section = byKey[activeKey] || null;

  const load = useCallback(
    () => getAdminLanding()
      .then((result) => {
        setLoadError(null);
        setData({ sections: result.sections || [], tableMissing: Boolean(result.tableMissing) });
      })
      .catch((error) => setLoadError(error))
      .finally(() => setLoading(false)),
    []
  );

  useEffect(() => { load(); }, [load]);

  const notifyOk = (text) => setStatus({ type: "ok", text });
  const notifyError = (error) => setStatus({ type: "error", text: friendlyErrorMessage(error, t) });

  // Chạy một thao tác ghi: khóa nút, tải lại dữ liệu, xóa cache trang chủ để "Xem trước" thấy ngay.
  const run = async (action, okText) => {
    setBusy(true);
    setStatus(null);
    try {
      await action();
      clearLandingCache();
      await load();
      if (okText) notifyOk(okText);
      return true;
    } catch (error) {
      notifyError(error);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const seed = (keys) => run(async () => {
    const [vi, en] = await Promise.all([
      import("../../../i18n/locales/vi.json"),
      import("../../../i18n/locales/en.json"),
    ]);
    await seedLanding(buildSeedPayload(makeTranslator(vi.default), makeTranslator(en.default), keys));
  }, t("admin.landing.seedDone"));

  const handleReset = async () => {
    const ok = await confirm({
      title: t("admin.landing.resetTitle"),
      message: t("admin.landing.resetMessage", { section: t(`admin.landing.sections.${activeKey}`) }),
      confirmText: t("admin.landing.reset"),
      cancelText: t("common.cancel"),
      tone: "danger",
    });
    if (ok) await run(() => resetLandingSection(activeKey), t("admin.landing.resetDone"));
  };

  const handleDeleteItem = async (item) => {
    const ok = await confirm({
      title: t("admin.landing.deleteItemTitle"),
      message: t("admin.landing.deleteItemMessage", { name: itemSummary(item, activeKey) || `#${item.id}` }),
      confirmText: t("common.delete"),
      cancelText: t("common.cancel"),
      tone: "danger",
    });
    if (ok) await run(() => deleteLandingItem(item.id), t("admin.landing.itemDeleted"));
  };

  const saveSection = (draft) => run(() => updateLandingSection(activeKey, draft), t("admin.landing.saved"));
  const toggleSection = (visible) => run(() => updateLandingSection(activeKey, { is_visible: visible }), t("admin.landing.saved"));

  const seededOrder = useMemo(
    () => [...data.sections].sort((a, b) => a.sort_order - b.sort_order || a.id - b.id).map((s) => s.section_key),
    [data.sections]
  );
  const moveSection = (delta) => {
    const index = seededOrder.indexOf(activeKey);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= seededOrder.length) return;
    const next = [...seededOrder];
    [next[index], next[target]] = [next[target], next[index]];
    run(() => reorderLandingSections(next), t("admin.landing.saved"));
  };

  const items = section?.items || [];
  const moveItem = (index, delta) => {
    const target = index + delta;
    if (target < 0 || target >= items.length) return;
    const ids = items.map((i) => i.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    run(() => reorderLandingItems(activeKey, ids));
  };

  const saveItem = async (draft, existing) => {
    const ok = await run(
      () => (existing ? updateLandingItem(existing.id, draft) : createLandingItem(activeKey, draft)),
      t("admin.landing.saved")
    );
    if (ok) setEditing(null);
  };

  const hasItems = Boolean(ITEM_FIELDS[activeKey]);
  const hasSectionFields = (SECTION_FIELDS[activeKey] || []).length > 0;

  if (loading) return <LoadingState variant="block" />;
  if (loadError) return <ErrorState error={loadError} onRetry={() => { setLoading(true); setLoadError(null); load(); }} />;

  return (
    <div className="landing-admin">
      <header className="landing-header">
        <div>
          <h2>{t("admin.landing.title")}</h2>
          <p>{t("admin.landing.subtitle")}</p>
        </div>
        <div className="landing-header-actions">
          <a className="landing-btn" href="/" target="_blank" rel="noopener noreferrer">
            <span className="material-symbols-outlined" aria-hidden="true">open_in_new</span>
            {t("admin.landing.preview")}
          </a>
          <button type="button" className="landing-btn" onClick={() => seed(LANDING_KEYS.filter((k) => !byKey[k]))} disabled={busy || data.tableMissing || LANDING_KEYS.every((k) => byKey[k])}>
            <span className="material-symbols-outlined" aria-hidden="true">download</span>
            {t("admin.landing.seedAll")}
          </button>
        </div>
      </header>

      {data.tableMissing && <div className="landing-banner is-warning" role="alert">{t("admin.landing.tableMissing")}</div>}
      <div className="landing-status" role="status" aria-live="polite">
        {status && <span className={status.type === "error" ? "is-error" : "is-ok"}>{status.text}</span>}
      </div>

      <div className="landing-tabs" role="tablist" aria-label={t("admin.landing.tabsAria")}>
        {LANDING_KEYS.map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            id={`landing-tab-${key}`}
            aria-selected={activeKey === key}
            aria-controls="landing-panel"
            className={`landing-tab ${activeKey === key ? "is-active" : ""}`}
            onClick={() => { setActiveKey(key); setEditing(null); }}
          >
            {t(`admin.landing.sections.${key}`)}
            <span className={`landing-chip ${byKey[key] ? "is-custom" : ""}`}>
              {byKey[key] ? (byKey[key].is_visible ? t("admin.landing.customized") : t("admin.landing.hiddenBadge")) : t("admin.landing.usingDefault")}
            </span>
          </button>
        ))}
      </div>

      <section className="landing-panel" id="landing-panel" role="tabpanel" aria-labelledby={`landing-tab-${activeKey}`}>
        <p className="landing-hint">{t(`admin.landing.sectionHints.${activeKey}`)}</p>

        {!section ? (
          <div className="landing-banner">
            <p>{t("admin.landing.seedHint")}</p>
            <button type="button" className="landing-btn is-primary" onClick={() => seed([activeKey])} disabled={busy || data.tableMissing}>
              {t("admin.landing.seedSection")}
            </button>
          </div>
        ) : (
          <>
            <div className="landing-toolbar">
              <label className="landing-switch">
                <input type="checkbox" checked={section.is_visible} disabled={busy} onChange={(event) => toggleSection(event.target.checked)} />
                <span>{t("admin.landing.visibleSection")}</span>
              </label>
              <div className="landing-actions">
                <button type="button" className="landing-btn" onClick={() => moveSection(-1)} disabled={busy || seededOrder.indexOf(activeKey) <= 0} aria-label={t("admin.landing.moveSectionUp")} title={t("admin.landing.moveSectionUp")}>
                  <span className="material-symbols-outlined" aria-hidden="true">arrow_upward</span>
                </button>
                <button type="button" className="landing-btn" onClick={() => moveSection(1)} disabled={busy || seededOrder.indexOf(activeKey) >= seededOrder.length - 1} aria-label={t("admin.landing.moveSectionDown")} title={t("admin.landing.moveSectionDown")}>
                  <span className="material-symbols-outlined" aria-hidden="true">arrow_downward</span>
                </button>
                <button type="button" className="landing-btn is-danger" onClick={handleReset} disabled={busy}>{t("admin.landing.reset")}</button>
              </div>
            </div>

            {hasSectionFields && (
              <SectionForm key={`${activeKey}-${section.updated_at || ""}`} sectionKey={activeKey} section={section} busy={busy} onSave={saveSection} t={t} />
            )}

            {hasItems && (
              <div className="landing-items">
                <div className="landing-items-head">
                  <h3>{t("admin.landing.items")}</h3>
                  <button type="button" className="landing-btn is-primary" onClick={() => setEditing("new")} disabled={busy || editing === "new"}>
                    <span className="material-symbols-outlined" aria-hidden="true">add</span>
                    {t("admin.landing.addItem")}
                  </button>
                </div>

                {!section.items_custom && items.length === 0 && <p className="landing-hint">{t("admin.landing.itemsDefault")}</p>}
                {section.items_custom && items.length === 0 && editing !== "new" && <p className="landing-hint">{t("admin.landing.noItems")}</p>}

                {editing === "new" && (
                  <div className="landing-card">
                    <ItemEditor sectionKey={activeKey} initial={null} busy={busy} onSave={(draft) => saveItem(draft, null)} onCancel={() => setEditing(null)} t={t} />
                  </div>
                )}

                <ul className="landing-item-list">
                  {items.map((item, index) => (
                    <li key={item.id} className={`landing-item ${item.is_visible ? "" : "is-hidden"}`}>
                      <div className="landing-item-row">
                        <div className="landing-item-text">
                          <strong>{itemSummary(item, activeKey) || t("admin.landing.untitled")}</strong>
                          {!item.is_visible && <span className="landing-chip">{t("admin.landing.hiddenBadge")}</span>}
                        </div>
                        <div className="landing-actions">
                          <button type="button" className="landing-btn" onClick={() => moveItem(index, -1)} disabled={busy || index === 0} aria-label={t("admin.landing.moveUp")} title={t("admin.landing.moveUp")}>
                            <span className="material-symbols-outlined" aria-hidden="true">arrow_upward</span>
                          </button>
                          <button type="button" className="landing-btn" onClick={() => moveItem(index, 1)} disabled={busy || index === items.length - 1} aria-label={t("admin.landing.moveDown")} title={t("admin.landing.moveDown")}>
                            <span className="material-symbols-outlined" aria-hidden="true">arrow_downward</span>
                          </button>
                          <button type="button" className="landing-btn" onClick={() => setEditing(editing === item.id ? null : item.id)} aria-expanded={editing === item.id}>
                            {t("common.edit")}
                          </button>
                          <button type="button" className="landing-btn is-danger" onClick={() => handleDeleteItem(item)} disabled={busy}>
                            {t("common.delete")}
                          </button>
                        </div>
                      </div>
                      {editing === item.id && (
                        <ItemEditor key={item.id} sectionKey={activeKey} initial={item} busy={busy} onSave={(draft) => saveItem(draft, item)} onCancel={() => setEditing(null)} t={t} />
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}

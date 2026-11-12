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
import ErrorState from "../../../shared/components/ErrorState";
import LoadingState from "../../../shared/components/LoadingState";
import { friendlyErrorMessage } from "../../../shared/utils/friendlyError";
import { clearLandingCache } from "../../public/landing/useLandingContent";
import { LANDING_KEYS, LANDING_GROUPS, buildSeedPayload, makeTranslator } from "../../public/landing/landingContent";
import { ItemEditor, SectionForm } from "./LandingEditors";
import { ITEM_FIELDS, SECTION_FIELDS, itemSummary } from "./landingAdminConfig";
import "./LandingManagement.css";

export default function LandingManagement() {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const [data, setData] = useState({ sections: [], tableMissing: false });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [activeGroup, setActiveGroup] = useState(LANDING_GROUPS[0].id);
  const [activeKey, setActiveKey] = useState(LANDING_GROUPS[0].keys[0]);
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
  // Chỉ đổi chỗ với mục kề bên trong cùng nhóm, nhưng luôn gửi đủ danh sách key theo thứ tự hiện tại.
  const groupKeys = (LANDING_GROUPS.find((g) => g.id === activeGroup) || LANDING_GROUPS[0]).keys;
  const groupOrder = seededOrder.filter((k) => groupKeys.includes(k));
  const groupIndex = groupOrder.indexOf(activeKey);
  const moveSection = (delta) => {
    const neighbor = groupOrder[groupIndex + delta];
    if (groupIndex < 0 || !neighbor) return;
    const next = [...seededOrder];
    const a = next.indexOf(activeKey);
    const b = next.indexOf(neighbor);
    [next[a], next[b]] = [next[b], next[a]];
    run(() => reorderLandingSections(next), t("admin.landing.saved"));
  };

  const selectGroup = (group) => {
    setActiveGroup(group.id);
    setActiveKey(group.keys[0]);
    setEditing(null);
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

      <div className="landing-tabs landing-group-tabs" role="tablist" aria-label={t("admin.landing.groupsAria")}>
        {LANDING_GROUPS.map((group) => (
          <button
            key={group.id}
            type="button"
            role="tab"
            id={`landing-group-${group.id}`}
            aria-selected={activeGroup === group.id}
            className={`landing-tab ${activeGroup === group.id ? "is-active" : ""}`}
            onClick={() => selectGroup(group)}
          >
            {t(`admin.landing.groups.${group.id}`)}
          </button>
        ))}
      </div>

      <div className="landing-tabs landing-section-tabs" role="tablist" aria-label={t("admin.landing.tabsAria")}>
        {groupKeys.map((key) => (
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
                <button type="button" className="landing-btn" onClick={() => moveSection(-1)} disabled={busy || groupIndex <= 0} aria-label={t("admin.landing.moveSectionUp")} title={t("admin.landing.moveSectionUp")}>
                  <span className="material-symbols-outlined" aria-hidden="true">arrow_upward</span>
                </button>
                <button type="button" className="landing-btn" onClick={() => moveSection(1)} disabled={busy || groupIndex < 0 || groupIndex >= groupOrder.length - 1} aria-label={t("admin.landing.moveSectionDown")} title={t("admin.landing.moveSectionDown")}>
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

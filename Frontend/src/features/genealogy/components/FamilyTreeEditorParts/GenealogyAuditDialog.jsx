import { useCallback, useEffect, useMemo, useState } from "react";
import { useLanguage } from "../../../../i18n/LanguageContext";
import { fullName } from "../../utils/tree-editor/treePersonUtils";
import {
  auditFamilyTreeAPI,
  getGenealogyPolicyAPI,
  listRelationOverridesAPI,
  recomputeGenerationsAPI,
  updateGenealogyPolicyAPI,
} from "../../../../api/managerService";

const SEVERITY_ORDER = ["error", "legal", "warning", "notice"];
const SEVERITY_ICON = { error: "block", legal: "gavel", warning: "warning", notice: "info" };
const NUMBER_FIELDS = [
  ["sameAncestorWarnGenerations", 0, 12],
  ["marriageLawYear", 1800, 2100],
  ["minParentAge", 8, 20],
  ["warnParentAge", 10, 25],
  ["maxMotherAge", 40, 80],
  ["maxFatherAge", 50, 110],
];

// Kiểm tra toàn cây (lỗi, quan hệ trái luật đã/ chưa xác nhận, cảnh báo, đời lệch), lịch sử xác nhận và cài đặt quy tắc.
export default function GenealogyAuditDialog({ open, clanId, people = [], canManage = false, onClose, onFocusPerson, onAudit, onChanged }) {
  const { t } = useLanguage();
  const [tab, setTab] = useState("issues");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [audit, setAudit] = useState(null);
  const [overrides, setOverrides] = useState([]);
  const [policy, setPolicy] = useState(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const peopleById = useMemo(() => new Map(people.map((person) => [Number(person.id), person])), [people]);

  const loadAudit = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await auditFamilyTreeAPI(clanId);
      setAudit(result);
      onAudit?.(result);
    } catch (loadError) {
      setError(loadError?.message || t("tree.audit.loadError"));
    } finally {
      setLoading(false);
    }
  }, [clanId, onAudit, t]);

  useEffect(() => {
    if (!open) return;
    setTab("issues");
    setMessage("");
    loadAudit();
    listRelationOverridesAPI(clanId).then((result) => setOverrides(result?.overrides || [])).catch(() => setOverrides([]));
    getGenealogyPolicyAPI(clanId).then((result) => setPolicy(result?.policy || null)).catch(() => setPolicy(null));
  }, [open, clanId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null;

  const issues = (audit?.issues || []).slice().sort((a, b) =>
    SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity) || Number(a.confirmed) - Number(b.confirmed));
  const generationChanges = audit?.generation_changes || [];
  const nameOf = (personId) => fullName(peopleById.get(Number(personId)), `#${personId}`);

  const fixGenerations = async () => {
    if (!window.confirm(t("tree.audit.fixGenerationsConfirm", { count: generationChanges.length }))) return;
    setSaving(true);
    setMessage("");
    try {
      const result = await recomputeGenerationsAPI(clanId);
      setMessage(result?.message || t("tree.audit.fixGenerationsDone"));
      await onChanged?.();
      await loadAudit();
    } catch (fixError) {
      setMessage(fixError?.message || t("tree.audit.saveError"));
    } finally {
      setSaving(false);
    }
  };

  const savePolicy = async () => {
    setSaving(true);
    setMessage("");
    try {
      const result = await updateGenealogyPolicyAPI(clanId, policy);
      setPolicy(result?.policy || policy);
      setMessage(result?.message || t("tree.audit.policySaved"));
      await loadAudit();
      await onChanged?.();
    } catch (saveError) {
      setMessage(saveError?.message || t("tree.audit.saveError"));
    } finally {
      setSaving(false);
    }
  };

  const setPolicyField = (key, value) => setPolicy((current) => ({ ...(current || {}), [key]: value }));

  return (
    <div className="fte-modalOverlay" role="presentation" onMouseDown={onClose}>
      <div className="fte-modal fte-auditModal" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
        <div className="fte-modalHeader">
          <div>
            <span>{t("tree.title")}</span>
            <h3>{t("tree.audit.title")}</h3>
          </div>
          <button type="button" className="fte-iconButton" onClick={onClose} title={t("common.close")}>
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="fte-auditTabs" role="tablist">
          {["issues", "overrides", "policy"].map((key) => (
            <button key={key} type="button" role="tab" aria-selected={tab === key} className={tab === key ? "is-active" : ""} onClick={() => setTab(key)}>
              {t(`tree.audit.tabs.${key}`)}
            </button>
          ))}
        </div>

        {message ? <div className="fte-auditMessage">{message}</div> : null}
        {error ? <div className="fte-auditMessage is-error">{error}</div> : null}

        {tab === "issues" ? (
          <div className="fte-auditBody">
            {loading ? <p>{t("tree.audit.loading")}</p> : null}
            {audit && !loading ? (
              <>
                <div className="fte-auditSummary">
                  {SEVERITY_ORDER.map((severity) => (
                    <span key={severity} className={`is-${severity}`}>
                      <span className="material-symbols-outlined">{SEVERITY_ICON[severity]}</span>
                      {t(`tree.audit.severity.${severity}`)}: {issues.filter((issue) => issue.severity === severity).length}
                    </span>
                  ))}
                </div>
                {generationChanges.length ? (
                  <div className="fte-auditGenerations">
                    <p>{t("tree.audit.generationMismatch", { count: generationChanges.length })}</p>
                    <small>
                      {generationChanges.slice(0, 6).map((change) => `${nameOf(change.person_id)}: ${change.from ?? "?"} → ${change.to}`).join("; ")}
                    </small>
                    {canManage ? (
                      <button type="button" className="fte-primaryButton" disabled={saving} onClick={fixGenerations}>
                        <span className="material-symbols-outlined">stairs</span>
                        {t("tree.audit.fixGenerations")}
                      </button>
                    ) : null}
                  </div>
                ) : null}
                {!issues.length && !generationChanges.length ? <p className="fte-auditOk">{t("tree.audit.allGood")}</p> : null}
                <ul className="fte-auditList">
                  {issues.map((issue, index) => (
                    <li key={`${issue.code}-${index}`} className={`is-${issue.severity} ${issue.confirmed ? "is-confirmed" : ""}`}>
                      <span className="material-symbols-outlined">{SEVERITY_ICON[issue.severity] || "info"}</span>
                      <div>
                        <p>{issue.message}</p>
                        <div className="fte-auditPeople">
                          {(issue.person_ids || []).map((personId) => (
                            <button key={personId} type="button" onClick={() => onFocusPerson?.(personId)}>{nameOf(personId)}</button>
                          ))}
                          {issue.severity === "legal" ? (
                            <em>{issue.confirmed ? t("tree.audit.confirmed") : issue.historical ? t("tree.audit.historicalUnconfirmed") : t("tree.audit.strict")}</em>
                          ) : null}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </div>
        ) : null}

        {tab === "overrides" ? (
          <div className="fte-auditBody">
            {!overrides.length ? <p>{t("tree.audit.noOverrides")}</p> : null}
            <ul className="fte-auditList">
              {overrides.map((item) => (
                <li key={item.id} className={`is-${item.severity}`}>
                  <span className="material-symbols-outlined">history_edu</span>
                  <div>
                    <p>{item.message}</p>
                    <small>
                      {[
                        item.created_at ? new Date(item.created_at).toLocaleString("vi-VN") : "",
                        item.confirmed_by ? t("tree.audit.confirmedBy", { name: item.confirmed_by }) : "",
                        item.source_type ? t(`tree.historical.sources.${item.source_type}`) : "",
                        item.source_note || "",
                      ].filter(Boolean).join(" · ")}
                    </small>
                    {item.reason ? <p className="fte-auditReason">{t("tree.audit.reason", { reason: item.reason })}</p> : null}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {tab === "policy" ? (
          <div className="fte-auditBody">
            {!policy ? <p>{t("tree.audit.loading")}</p> : (
              <div className="fte-formGrid">
                <label>
                  {t("tree.audit.policy.lineage")}
                  <select value={policy.lineage} disabled={!canManage} onChange={(event) => setPolicyField("lineage", event.target.value)}>
                    <option value="patrilineal">{t("tree.audit.policy.lineages.patrilineal")}</option>
                    <option value="matrilineal">{t("tree.audit.policy.lineages.matrilineal")}</option>
                  </select>
                </label>
                <label>
                  {t("tree.audit.policy.region")}
                  <select value={policy.region} disabled={!canManage} onChange={(event) => setPolicyField("region", event.target.value)}>
                    {["north", "central", "south"].map((region) => (
                      <option key={region} value={region}>{t(`tree.audit.policy.regions.${region}`)}</option>
                    ))}
                  </select>
                </label>
                {NUMBER_FIELDS.map(([key, min, max]) => (
                  <label key={key}>
                    {t(`tree.audit.policy.${key}`)}
                    <input
                      type="number"
                      min={min}
                      max={max}
                      value={policy[key] ?? ""}
                      disabled={!canManage}
                      onChange={(event) => setPolicyField(key, event.target.value)}
                    />
                  </label>
                ))}
                <label>
                  {t("tree.audit.policy.sensitiveRelationVisibility")}
                  <select value={policy.sensitiveRelationVisibility} disabled={!canManage} onChange={(event) => setPolicyField("sensitiveRelationVisibility", event.target.value)}>
                    <option value="managers">{t("tree.audit.policy.visibility.managers")}</option>
                    <option value="public">{t("tree.audit.policy.visibility.public")}</option>
                  </select>
                </label>
                <p className="fte-fieldHint is-wide">{t("tree.audit.policy.hint")}</p>
              </div>
            )}
          </div>
        ) : null}

        <div className="fte-modalFooter">
          {tab === "policy" && canManage && policy ? (
            <button type="button" className="fte-primaryButton" disabled={saving} onClick={savePolicy}>
              <span className="material-symbols-outlined">save</span>
              {t("tree.audit.savePolicy")}
            </button>
          ) : null}
          {tab === "issues" ? (
            <button type="button" className="fte-ghostButton" disabled={loading} onClick={loadAudit}>
              <span className="material-symbols-outlined">refresh</span>
              {t("tree.audit.rerun")}
            </button>
          ) : null}
          <button type="button" className="fte-ghostButton" onClick={onClose}>{t("common.close")}</button>
        </div>
      </div>
    </div>
  );
}

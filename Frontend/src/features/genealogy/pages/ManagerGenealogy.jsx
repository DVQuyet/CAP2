import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { createTreeEditKeyAPI, getActiveTreeEditKeysAPI, getManagerTree, updateManagerClanInfo } from "../../../api/managerService";
import FamilyTreeEditor from "../components/FamilyTreeEditor.jsx";
import { formatDateTimeVN } from "../../../shared/utils/dateFormat";
import { onSocketEvent } from "../../../services/socket";
import "../../manager/pages/manager.css";

export default function GenealogySection() {
  const { t } = useTranslation();
  const [people, setPeople] = useState([]);
  const [families, setFamilies] = useState([]);
  const [children, setChildren] = useState([]);
  const [layoutSettings, setLayoutSettings] = useState({ line_routes: {}, card_sizes: {} });
  const [clan, setClan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [error, setError] = useState("");
  const [isKeyPanelOpen, setIsKeyPanelOpen] = useState(false);
  const [selectedMemberAccountIds, setSelectedMemberAccountIds] = useState([]);
  const [memberSearch, setMemberSearch] = useState("");
  const [keySaving, setKeySaving] = useState(false);
  const [keyError, setKeyError] = useState("");
  const [generatedKeys, setGeneratedKeys] = useState([]);
  const [activeKeys, setActiveKeys] = useState([]);
  const [keyModalOpen, setKeyModalOpen] = useState(false);
  const [activeKeysLoading, setActiveKeysLoading] = useState(false);
  const [isClanInfoOpen, setIsClanInfoOpen] = useState(false);
  const [clanForm, setClanForm] = useState({ clan_name: "", history: "", hall_address: "" });
  const [clanSaving, setClanSaving] = useState(false);
  const [clanMessage, setClanMessage] = useState("");
  const [clanError, setClanError] = useState("");
  const treeReloadTimerRef = useRef(null);

  const formatPersonName = (person) =>
    person?.display_name ||
    [person?.surname, person?.middle_name, person?.first_name].filter(Boolean).join(" ").trim() ||
    t("tree.page.memberFallback");

  const normalizeSearchText = (value) =>
    String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();

  const formatDateTime = (value) => (value ? formatDateTimeVN(value) : t("tree.page.keyDefaultExpiry"));

  const loadTree = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await getManagerTree();
      setPeople(Array.isArray(data.treeMembers) ? data.treeMembers : []);
      setFamilies(Array.isArray(data.families) ? data.families : []);
      setChildren(Array.isArray(data.children) ? data.children : []);
      setLayoutSettings(data.layoutSettings || { line_routes: {}, card_sizes: {} });
      setClan(data.clan || null);
    } catch (err) {
      setError(err?.message || t("tree.page.errors.loadTree"));
      setLayoutSettings({ line_routes: {}, card_sizes: {} });
    } finally {
      setLoading(false);
    }
  }, []);

  const scheduleReloadTree = useCallback(() => {
    if (treeReloadTimerRef.current) {
      window.clearTimeout(treeReloadTimerRef.current);
    }

    treeReloadTimerRef.current = window.setTimeout(() => {
      treeReloadTimerRef.current = null;
      loadTree();
    }, 500);
  }, [loadTree]);

  useEffect(() => {
    loadTree();
  }, [loadTree]);

  useEffect(() => {
    const offTreeUpdated = onSocketEvent("tree_updated", (payload) => {
      console.log("Manager tree realtime tree_updated received:", payload);

      const currentClanId = clan?.id || clan?.clan_id;
      if (
        payload?.clan_id &&
        currentClanId &&
        Number(payload.clan_id) !== Number(currentClanId)
      ) {
        return;
      }

      if (payload?.action === "tree_layout_updated") {
        return;
      }

      scheduleReloadTree();
    });

    return () => {
      offTreeUpdated();
    };
  }, [scheduleReloadTree, clan?.id, clan?.clan_id]);

  useEffect(() => {
    return () => {
      if (treeReloadTimerRef.current) {
        window.clearTimeout(treeReloadTimerRef.current);
        treeReloadTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    setClanForm({
      clan_name: clan?.clan_name || "",
      history: clan?.history || "",
      hall_address: clan?.hall_address || "",
    });
  }, [clan?.id, clan?.clan_name, clan?.history, clan?.hall_address]);

  const loadActiveKeys = useCallback(async () => {
    if (!clan?.id) return;
    setActiveKeysLoading(true);
    try {
      const response = await getActiveTreeEditKeysAPI(clan.id);
      const keys = Array.isArray(response?.keys) ? response.keys : [];
      setActiveKeys(
        keys.sort((a, b) => {
          const bTime = new Date(b.created_at || b.expires_at || 0).getTime();
          const aTime = new Date(a.created_at || a.expires_at || 0).getTime();
          return bTime - aTime;
        }),
      );
    } catch (err) {
      setKeyError(err?.message || t("tree.page.errors.loadKeys"));
    } finally {
      setActiveKeysLoading(false);
    }
  }, [clan?.id]);

  useEffect(() => {
    loadActiveKeys();
  }, [loadActiveKeys]);

  const editableMembers = useMemo(
    () =>
      people.filter(
        (person) =>
          Number(person.account_id) > 0 &&
          Number(person.role_id) === 3 &&
          String(person.account_status || "").toLowerCase() === "active",
      ),
    [people],
  );

  const filteredEditableMembers = useMemo(() => {
    const keyword = normalizeSearchText(memberSearch);
    if (!keyword) return editableMembers;
    return editableMembers.filter((person) =>
      normalizeSearchText(`${formatPersonName(person)} ${person.account_id} ${person.account_email || ""}`).includes(keyword),
    );
  }, [editableMembers, memberSearch]);

  useEffect(() => {
    setSelectedMemberAccountIds((current) =>
      current.filter((accountId) => editableMembers.some((person) => Number(person.account_id) === Number(accountId))),
    );
  }, [editableMembers]);

  const selectedCount = selectedMemberAccountIds.length;

  const toggleMemberSelection = (accountId) => {
    const id = Number(accountId);
    setSelectedMemberAccountIds((current) =>
      current.some((item) => Number(item) === id) ? current.filter((item) => Number(item) !== id) : [...current, id],
    );
  };

  const selectFilteredMembers = () => {
    const ids = filteredEditableMembers.map((person) => Number(person.account_id)).filter((id) => Number.isFinite(id));
    setSelectedMemberAccountIds((current) => [...new Set([...current, ...ids])]);
  };

  const clearSelectedMembers = () => setSelectedMemberAccountIds([]);

  const handleGenerateKey = async () => {
    if (!selectedMemberAccountIds.length) {
      setKeyError(t("tree.page.errors.selectMemberForKey"));
      return;
    }

    setKeySaving(true);
    setKeyError("");
    try {
      const response = await createTreeEditKeyAPI(selectedMemberAccountIds);
      const keys = (Array.isArray(response?.keys) ? response.keys : response?.key ? [response] : []).sort((a, b) => {
        const bTime = new Date(b.created_at || b.expires_at || 0).getTime();
        const aTime = new Date(a.created_at || a.expires_at || 0).getTime();
        return bTime - aTime;
      });
      setGeneratedKeys(keys);
      setKeyModalOpen(true);
      await loadActiveKeys();
    } catch (err) {
      setKeyError(err?.message || t("tree.page.errors.createKey"));
    } finally {
      setKeySaving(false);
    }
  };

  const copyKey = async (key) => {
    if (!key) return;
    try {
      await navigator.clipboard.writeText(key);
    } catch {
      setKeyError(t("tree.page.errors.copyKey"));
    }
  };

  const copyGeneratedKeys = async () => {
    const text = generatedKeys
      .filter((item) => item?.key)
      .map((item) => `${item.member_name || t("tree.page.memberFallback")}: ${item.key}`)
      .join("\n");
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      setKeyError(t("tree.page.errors.copyKeyList"));
    }
  };

  const renderKeyList = (items, emptyText) =>
    items.length === 0 ? (
      <div className="tree-key-empty">{emptyText}</div>
    ) : (
      <div className="tree-key-list">
        {items.map((item) => (
          <div className="tree-key-row" key={item.id || `${item.member_account_id}-${item.created_at}-${item.key}`}>
            <div className="tree-key-row-main">
              <strong>{item.member_name || t("tree.page.memberFallback")}</strong>
              <span>{t("tree.page.keyCreatedAt", { value: formatDateTime(item.created_at) })}</span>
              <span>{t("tree.page.keyExpiresAt", { value: formatDateTime(item.expires_at) })}</span>
            </div>
            <code>{item.key || t("tree.page.hiddenOldKey")}</code>
            {item.key ? (
              <button className="mgr-btnGhost" type="button" onClick={() => copyKey(item.key)}>
                {t("tree.page.copy")}
              </button>
            ) : null}
          </div>
        ))}
      </div>
    );

  const openClanInfo = () => {
    setClanError("");
    setClanMessage("");
    setClanForm({
      clan_name: clan?.clan_name || "",
      history: clan?.history || "",
      hall_address: clan?.hall_address || "",
    });
    setIsClanInfoOpen(true);
  };

  const handleClanFormChange = (field, value) => {
    setClanForm((current) => ({ ...current, [field]: value }));
  };

  const saveClanInfo = async (event) => {
    event.preventDefault();
    setClanSaving(true);
    setClanError("");
    setClanMessage("");
    try {
      const response = await updateManagerClanInfo(clanForm);
      setClan(response?.clan || { ...clan, ...clanForm });
      setClanMessage(response?.message || t("tree.page.messages.saveClanSuccess"));
      await loadTree();
    } catch (err) {
      setClanError(err?.message || t("tree.page.errors.saveClan"));
    } finally {
      setClanSaving(false);
    }
  };

  const renderClanInfoModal = () => (
    <div className="clan-info-modalOverlay" role="dialog" aria-modal="true">
      <form className="clan-info-modal" onSubmit={saveClanInfo}>
        <div className="clan-info-modalHead">
          <div>
            <span>{t("tree.page.clanInfo")}</span>
            <h2>{clan?.clan_name || t("tree.page.clanFallback")}</h2>
            <p>{t("tree.page.managerClanInfoHelp")}</p>
            <p className="clan-info-dbId">{t("tree.page.clanDbId")}: <strong>{clan?.id ?? clan?.clan_id ?? t("common.noInfo")}</strong></p>
          </div>
          <button className="clan-info-close" type="button" onClick={() => setIsClanInfoOpen(false)} aria-label={t("common.close")}>
            ×
          </button>
        </div>

        {clanError ? <div className="manager-inline-error">{clanError}</div> : null}
        {clanMessage ? <div className="manager-inline-success">{clanMessage}</div> : null}

        <label className="clan-info-field">
          <span>{t("tree.page.clanName")}</span>
          <input value={clanForm.clan_name} onChange={(event) => handleClanFormChange("clan_name", event.target.value)} placeholder={t("tree.page.clanNamePlaceholder")} />
        </label>
        <label className="clan-info-field">
          <span>{t("tree.page.clanHistory")}</span>
          <textarea value={clanForm.history} onChange={(event) => handleClanFormChange("history", event.target.value)} rows={6} placeholder={t("tree.page.clanHistoryPlaceholder")} />
        </label>
        <label className="clan-info-field">
          <span>{t("tree.page.clanHallAddress")}</span>
          <textarea value={clanForm.hall_address} onChange={(event) => handleClanFormChange("hall_address", event.target.value)} rows={3} placeholder={t("tree.page.clanHallAddressPlaceholder")} />
        </label>

        <div className="clan-info-metaGrid clan-info-metaGrid--four">
          <div><strong>{clan?.id ?? clan?.clan_id ?? "-"}</strong><span>{t("tree.page.clanId")}</span></div>
          <div><strong>{people.length}</strong><span>{t("tree.page.members")}</span></div>
          <div><strong>{families.length}</strong><span>{t("tree.page.families")}</span></div>
          <div><strong>{children.length}</strong><span>{t("tree.page.childLinks")}</span></div>
        </div>

        <div className="clan-info-actions">
          <button className="mgr-btnGhost" type="button" onClick={() => setIsClanInfoOpen(false)}>{t("common.close")}</button>
          <button className="mgr-btnPrimary" type="submit" disabled={clanSaving}>{clanSaving ? t("tree.page.saving") : t("tree.page.saveClanInfo")}</button>
        </div>
      </form>
    </div>
  );

  const renderEditor = () => (
    <FamilyTreeEditor
      clan={clan}
      people={people}
      families={families}
      children={children}
      loading={loading}
      onReload={scheduleReloadTree}
      layoutSettings={layoutSettings}
    />
  );

  const renderTemporaryKeyPanel = () => (
    <div className="panel-card tree-key-panel tree-key-panel--compact">
      <div className="panel-header">
        <h2>{t("tree.page.temporaryEditKey")}</h2>
        <span>{t("tree.page.temporaryEditKeyHelp")}</span>
      </div>

      <div className="tree-key-bulk">
        <label className="tree-key-field">
          <span>{t("tree.page.searchMemberByName")}</span>
          <input
            className="mgr-field"
            value={memberSearch}
            onChange={(event) => setMemberSearch(event.target.value)}
            placeholder={t("tree.page.searchMemberPlaceholder")}
            disabled={keySaving || !editableMembers.length}
          />
        </label>

        <div className="tree-key-toolbar">
          <span>{t("tree.page.selectedMembers", { count: selectedCount })}</span>
          <button className="mgr-btnGhost" type="button" onClick={selectFilteredMembers} disabled={keySaving || !filteredEditableMembers.length}>
            {t("tree.page.selectFiltered")}
          </button>
          <button className="mgr-btnGhost" type="button" onClick={clearSelectedMembers} disabled={keySaving || !selectedCount}>
            {t("tree.page.clearSelection")}
          </button>
          <button className="mgr-btnPrimary" type="button" onClick={handleGenerateKey} disabled={keySaving || !selectedCount}>
            {keySaving ? t("tree.page.generating") : t("tree.page.generateKeys", { count: selectedCount || "" })}
          </button>
        </div>

        <div className="tree-key-member-list">
          {filteredEditableMembers.length === 0 ? (
            <div className="tree-key-empty">{t("tree.page.noMatchingMember")}</div>
          ) : (
            filteredEditableMembers.map((person) => {
              const checked = selectedMemberAccountIds.some((accountId) => Number(accountId) === Number(person.account_id));
              return (
                <label className={`tree-key-member ${checked ? "is-selected" : ""}`} key={person.account_id}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleMemberSelection(person.account_id)}
                    disabled={keySaving}
                  />
                  <span>
                    <strong>{formatPersonName(person)}</strong>
                    <small>{person.account_email || person.account_email || t("tree.page.memberFallback")}</small>
                  </span>
                </label>
              );
            })
          )}
        </div>
      </div>

      {keyError ? <div className="manager-inline-error">{keyError}</div> : null}

      <div className="tree-key-active">
        <div className="tree-key-section-head">
          <strong>{t("tree.page.activeKeys")}</strong>
          <button className="mgr-btnGhost" type="button" onClick={loadActiveKeys} disabled={activeKeysLoading}>
            {activeKeysLoading ? t("common.loading") : t("common.reload")}
          </button>
        </div>
        {renderKeyList(activeKeys, t("tree.page.noActiveKeys"))}
      </div>
    </div>
  );

  return (
    <section className="manager-genealogy-page">
      <div className="manager-data-header">
        <div>
          <h2>{clan?.clan_name || t("tree.title")}</h2>
          <p>{t("tree.page.managerDescription")}</p>
        </div>
        <div className="tree-panel-actions">
          <button className="mgr-btnGhost" type="button" onClick={openClanInfo}>
            {t("tree.page.clanInfo")}
          </button>
          <div className="tree-action-popover">
            <button
              className={`mgr-btnGhost ${isKeyPanelOpen ? "is-active" : ""}`}
              type="button"
              onClick={() => setIsKeyPanelOpen((value) => !value)}
            >
              {t("tree.page.temporaryEditKey")}
            </button>
            {isKeyPanelOpen ? renderTemporaryKeyPanel() : null}
          </div>
          <button className="mgr-btnGhost" type="button" onClick={loadTree} disabled={loading}>
            {t("common.reload")}
          </button>
        </div>
      </div>

      {error && <div className="manager-inline-error">{error}</div>}
      {isClanInfoOpen ? renderClanInfoModal() : null}

      <div className="management-grid management-grid--single">
        <div className="panel-card tree-preview-panel">
          <div className="panel-header">
            <h2>{t("tree.page.editorTitle")}</h2>
            <span>{t("tree.page.memberCount", { count: people.length })}</span>
          </div>
          <div className="tree-container">{renderEditor()}</div>
        </div>
      </div>

      {keyModalOpen && (
        <div className="tree-key-modal-overlay" role="dialog" aria-modal="true">
          <div className="tree-key-modal">
            <div className="tree-key-modal-head">
              <div>
                <h2>{t("tree.page.generatedKeysTitle")}</h2>
                <span>{t("tree.page.generatedKeysSubtitle", { count: generatedKeys.length })}</span>
              </div>
              <button className="mgr-modalClose" type="button" onClick={() => setKeyModalOpen(false)}>
                ×
              </button>
            </div>
            <div className="tree-key-modal-actions">
              <button className="mgr-btnPrimary" type="button" onClick={copyGeneratedKeys} disabled={!generatedKeys.length}>
                {t("tree.page.copyAllNewKeys")}
              </button>
              <button className="mgr-btnGhost" type="button" onClick={loadActiveKeys} disabled={activeKeysLoading}>
                {activeKeysLoading ? t("common.loading") : t("tree.page.refreshActiveKeys")}
              </button>
            </div>
            {renderKeyList(generatedKeys, t("tree.page.noNewKeys"))}
            <div className="tree-key-modal-section">
              <div className="tree-key-section-head">
                <strong>{t("tree.page.activeKeys")}</strong>
                <span>{t("tree.page.newestFirst")}</span>
              </div>
              {renderKeyList(activeKeys, t("tree.page.noActiveKeys"))}
            </div>
          </div>
        </div>
      )}

      {isFullscreen && (
        <div className="tree-fullscreen-overlay" role="dialog" aria-modal="true">
          <div className="tree-fullscreen-panel">
            <div className="panel-header">
              <h2>{clan?.clan_name || t("tree.title")}</h2>
              <button className="mgr-btnGhost" type="button" onClick={() => setIsFullscreen(false)}>
                {t("tree.page.exitFullscreen")}
              </button>
            </div>
            <div className="tree-container tree-container--fullscreen">{renderEditor()}</div>
          </div>
        </div>
      )}
    </section>
  );
}

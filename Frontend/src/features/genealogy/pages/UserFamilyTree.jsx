import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { getMemberDashboard, verifyTreeEditSession } from "../../../api/memberService";
import FamilyTreeEditor from "../components/FamilyTreeEditor.jsx";
import { onSocketEvent, connectSocketFromStorage } from "../../../services/socket";
import { clearTreeEditSession, readTreeEditSession, saveTreeEditSession } from "../../../services/treeEditSession";
import "../../member/pages/MemberDashboard.css";

export default function FamilyTreePage() {
  const { t } = useTranslation();
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isClanInfoOpen, setIsClanInfoOpen] = useState(false);
  const [keyInput, setKeyInput] = useState("");
  const [keySaving, setKeySaving] = useState(false);
  const [keyStatus, setKeyStatus] = useState("");
  const [keyError, setKeyError] = useState("");
  const [permission, setPermission] = useState({
    canEdit: false,
    editScope: "none",
    allowedNodeIds: [],
    memberGeneration: null,
    allowedGenerations: [],
  });
  const [permissionExpiry, setPermissionExpiry] = useState("");
  const treeReloadTimerRef = useRef(null);

  const resolvePermissionExpiry = useCallback((response) => {
    const expiresInMs = Number(response?.expires_in_ms);
    if (Number.isFinite(expiresInMs) && expiresInMs > 0) {
      return new Date(Date.now() + expiresInMs).toISOString();
    }

    const expiresAt = typeof response?.expires_at === "string" ? response.expires_at : "";
    const expiresAtTime = Date.parse(expiresAt);
    return Number.isFinite(expiresAtTime) && expiresAtTime > Date.now() ? expiresAt : "";
  }, []);

  const loadTree = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await getMemberDashboard();
      setDashboard(response);
    } catch (err) {
      setError(err?.message || t("tree.page.errors.loadTree"));
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
    connectSocketFromStorage();

    const offTreeUpdated = onSocketEvent("tree_updated", (payload) => {
      console.log("[Member FamilyTreePage] tree_updated:", payload);

      const currentClanId = dashboard?.clan?.id || dashboard?.clan?.clan_id;

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
  }, [scheduleReloadTree, dashboard?.clan?.id, dashboard?.clan?.clan_id]);

  useEffect(() => {
    return () => {
      if (treeReloadTimerRef.current) {
        window.clearTimeout(treeReloadTimerRef.current);
        treeReloadTimerRef.current = null;
      }
    };
  }, []);

  const resetTemporaryPermission = useCallback((message = "") => {
    clearTreeEditSession();
    setPermission({
      canEdit: false,
      editScope: "none",
      allowedNodeIds: [],
      memberGeneration: null,
      allowedGenerations: [],
    });
    setPermissionExpiry("");
    if (message) setKeyStatus(message);
  }, []);

  const activateTemporaryPermission = useCallback(
    async (rawKey, options = {}) => {
      const key = String(rawKey || "").trim();
      const silent = options.silent === true;
      if (!key) {
        setKeyError(t("tree.page.errors.enterTemporaryKey"));
        return;
      }

      setKeySaving(true);
      if (!silent) {
        setKeyError("");
        setKeyStatus("");
      }

      try {
        const response = await verifyTreeEditSession(key, { activate: !silent });
        const expiresAt = resolvePermissionExpiry(response);
        if (!expiresAt) {
          resetTemporaryPermission("");
          setKeyError(t("tree.page.errors.keyExpiredAskManager"));
          return;
        }
        saveTreeEditSession({ key, expiresAt });
        setPermission({
          canEdit: true,
          editScope: "limited",
          allowedNodeIds: Array.isArray(response.allowed_node_ids) ? response.allowed_node_ids : [],
          memberGeneration: response.member_generation ?? null,
          allowedGenerations: Array.isArray(response.allowed_generations) ? response.allowed_generations : [],
        });
        setPermissionExpiry(expiresAt);
        setKeyInput(key);
        setKeyStatus(t("tree.page.messages.temporaryEditEnabled"));
        setKeyError("");
      } catch (err) {
        resetTemporaryPermission("");
        setKeyError(err?.message || t("tree.page.errors.invalidTemporaryKey"));
      } finally {
        setKeySaving(false);
      }
    },
    [resetTemporaryPermission, resolvePermissionExpiry],
  );

  useEffect(() => {
    const session = readTreeEditSession();
    if (!session?.key) return;
    setKeyInput(session.key);
    activateTemporaryPermission(session.key, { silent: true });
  }, [activateTemporaryPermission]);

  useEffect(() => {
    if (!permissionExpiry) return undefined;

    const syncExpiry = () => {
      if (Date.parse(permissionExpiry) <= Date.now()) {
        resetTemporaryPermission(t("tree.page.messages.temporaryEditExpired"));
      }
    };

    syncExpiry();
    const timer = window.setInterval(syncExpiry, 1000);
    return () => window.clearInterval(timer);
  }, [permissionExpiry, resetTemporaryPermission]);

  const treeMembers = Array.isArray(dashboard?.treeMembers) ? dashboard.treeMembers : [];
  const families = Array.isArray(dashboard?.families) ? dashboard.families : [];
  const children = Array.isArray(dashboard?.children) ? dashboard.children : [];
  const clan = dashboard?.clan || {};
  const clanName = clan?.clan_name || t("tree.title");

  const remainingMs = permissionExpiry ? Math.max(0, Date.parse(permissionExpiry) - Date.now()) : 0;
  const remainingText = permissionExpiry
    ? `${Math.floor(remainingMs / 60000)}:${String(Math.floor((remainingMs % 60000) / 1000)).padStart(2, "0")}`
    : "";
  const generationScopeText = permission.allowedGenerations?.length
    ? permission.allowedGenerations.map((generation) => t("tree.page.generationLabel", { generation })).join(", ")
    : t("tree.page.currentGenerationPlusMinus");

  const renderClanInfoModal = () => (
    <div className="member-clan-modalOverlay" role="dialog" aria-modal="true">
      <div className="member-clan-modal">
        <div className="member-clan-modalHead">
          <div>
            <span>{t("tree.page.clanInfo")}</span>
            <h2>{clanName}</h2>
            <p>{t("tree.page.memberClanInfoHelp")}</p>
            <p className="member-clan-dbId">{t("tree.page.clanDbId")}: <strong>{clan?.id ?? clan?.clan_id ?? t("common.noInfo")}</strong></p>
          </div>
          <button type="button" onClick={() => setIsClanInfoOpen(false)} aria-label={t("common.close")}>×</button>
        </div>
        <div className="member-clan-infoGrid">
          <article>
            <span>{t("tree.page.clanHistory")}</span>
            <p>{clan?.history || t("tree.page.emptyClanHistory")}</p>
          </article>
          <article>
            <span>{t("tree.page.clanHallAddressShort")}</span>
            <p>{clan?.hall_address || t("tree.page.emptyClanHallAddress")}</p>
          </article>
        </div>
        <div className="member-clan-stats member-clan-stats--four">
          <div><strong>{clan?.id ?? clan?.clan_id ?? "-"}</strong><span>{t("tree.page.clanId")}</span></div>
          <div><strong>{treeMembers.length}</strong><span>{t("tree.page.members")}</span></div>
          <div><strong>{families.length}</strong><span>{t("tree.page.families")}</span></div>
          <div><strong>{children.length}</strong><span>{t("tree.page.childLinks")}</span></div>
        </div>
        <div className="member-clan-actions">
          <button className="member-btn member-btn-primary" type="button" onClick={() => setIsClanInfoOpen(false)}>{t("common.close")}</button>
        </div>
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="member-portal-page">
        <section className="member-panel">
          <div className="member-empty">{t("tree.messages.loading")}</div>
        </section>
      </div>
    );
  }

  return (
    <div className="member-portal-page">
      {error && <div className="member-alert is-error">{error}</div>}
      {keyError && <div className="member-alert is-error">{keyError}</div>}
      {keyStatus && !keyError ? <div className="member-alert is-success">{keyStatus}</div> : null}

      <section className="member-hero-panel">
        <div>
          <span className="member-kicker">{t("tree.title")}</span>
          <h1>{clanName}</h1>
          <p>{t("tree.page.memberHeroDescription")}</p>
        </div>
      </section>

      {isClanInfoOpen ? renderClanInfoModal() : null}

      <div className="member-tree-toolbar">
        <button className="member-btn member-btn-ghost" type="button" onClick={loadTree} disabled={loading}>
          {t("common.reload")}
        </button>
        <button className="member-btn member-btn-ghost" type="button" onClick={() => setIsClanInfoOpen(true)}>
          {t("tree.page.clanInfo")}
        </button>
        <div className="member-tree-keyBox">
        <input
          className="member-tree-keyInput"
          type="text"
          placeholder={t("tree.page.enterTemporaryKey")}
          value={keyInput}
          disabled={keySaving || permission.canEdit}
          onChange={(e) => setKeyInput(e.target.value)}
        />

        {!permission.canEdit ? (
          <button
            className="member-btn member-btn-primary"
            type="button"
            disabled={keySaving || !keyInput.trim()}
            onClick={() => activateTemporaryPermission(keyInput)}
          >
            {keySaving ? t("tree.page.checking") : t("tree.page.enableEdit")}
          </button>
        ) : (
          <button
            className="member-btn member-btn-ghost"
            type="button"
            onClick={() => resetTemporaryPermission(t("tree.page.messages.temporaryEditDisabled"))}
          >
            {t("tree.page.disableEdit")}
          </button>
        )}

        {permission.canEdit && remainingText ? (
          <span className="member-tree-keyStatus">
            {t("tree.page.remainingTime", { value: remainingText })}
          </span>
        ) : null}
      </div>
      </div>

      <div className="member-tree-layout member-tree-layout--viewer">
        <section className="member-panel member-tree-main">
          {treeMembers.length === 0 ? (
            <div className="member-empty">{t("tree.page.emptyTree")}</div>
          ) : (
            <div className="member-tree-editorWrap">
              <FamilyTreeEditor
                clan={clan}
                people={treeMembers}
                families={families}
                children={children}
                layoutSettings={dashboard?.layoutSettings}
                loading={loading}
                readOnly={!permission.canEdit}
                editPermission={permission}
                onReload={scheduleReloadTree}
              />
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

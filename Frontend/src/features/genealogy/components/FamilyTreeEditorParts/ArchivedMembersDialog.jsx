import { useEffect, useState, useMemo } from "react";
import { useLanguage } from "../../../../i18n/LanguageContext";
import { getArchivedMembersAPI, restoreArchivedMemberAPI, deleteArchivedMemberAPI, deleteAllArchivedMembersAPI, archiveMemberAPI } from "../../../../api/managerService";
import { fullName } from "../../utils/tree-editor/treePersonUtils";

export default function ArchivedMembersDialog({ people, onClose, onReload }) {
  const { t, language } = useLanguage();
  const [activeTab, setActiveTab] = useState("list"); // "list" or "archive"
  const [archivedList, setArchivedList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  // Fields for archiving a member
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [archiveReason, setArchiveReason] = useState("");

  // Load archived members
  const fetchArchived = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await getArchivedMembersAPI();
      setArchivedList(Array.isArray(res) ? res : res?.items || res?.archived || res?.data || []);
    } catch (err) {
      console.error(err);
      setError(err?.message || t("tree.archive.loadError"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchArchived();
  }, []);

  // Filter archived members
  const filteredArchived = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return archivedList;
    return archivedList.filter(item => {
      const personObj = typeof item.person_json === "string" ? JSON.parse(item.person_json) : item.person_json;
      const accountObj = typeof item.account_json === "string" ? JSON.parse(item.account_json) : item.account_json;
      const name = (personObj ? fullName(personObj) : "").toLowerCase();
      const email = (accountObj?.email || item.email || "").toLowerCase();
      return name.includes(q) || email.includes(q);
    });
  }, [archivedList, searchQuery]);

  // List of active members with accounts who are NOT currently archived
  const activeMembersWithAccounts = useMemo(() => {
    const archivedAccountIds = new Set(archivedList.map(item => Number(item.account_id)));
    return people
      .filter(p => p.account_id && !archivedAccountIds.has(Number(p.account_id)))
      .map(p => ({
        id: p.id,
        account_id: p.account_id,
        name: fullName(p),
        email: p.account_email || ""
      }));
  }, [people, archivedList]);

  const handleRestore = async (archiveId) => {
    const ok = window.confirm(t("tree.archive.confirmRestore"));
    if (!ok) return;

    setActionLoading(true);
    setError("");
    try {
      await restoreArchivedMemberAPI(archiveId);
      // Refresh tree and archived list
      await onReload?.();
      await fetchArchived();
    } catch (err) {
      setError(err?.message || t("tree.archive.restoreError"));
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeletePermanently = async (archiveId) => {
    const ok = window.confirm(t("tree.archive.confirmDeletePermanently"));
    if (!ok) return;

    setActionLoading(true);
    setError("");
    try {
      await deleteArchivedMemberAPI(archiveId);
      await fetchArchived();
    } catch (err) {
      setError(err?.message || t("tree.archive.deleteError"));
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteAllPermanently = async () => {
    if (!filteredArchived.length) return;

    const ok = window.confirm(
      t("tree.archive.confirmDeleteAll", { count: filteredArchived.length })
    );
    if (!ok) return;

    setActionLoading(true);
    setError("");
    try {
      await deleteAllArchivedMembersAPI();
      await onReload?.();
      await fetchArchived();
    } catch (err) {
      setError(err?.message || t("tree.archive.deleteAllError"));
    } finally {
      setActionLoading(false);
    }
  };

  const handleArchiveSubmit = async (e) => {
    e.preventDefault();
    if (!selectedAccountId) {
      setError(t("tree.archive.selectMemberRequired"));
      return;
    }
    if (!archiveReason.trim()) {
      setError(t("tree.archive.reasonRequired"));
      return;
    }

    const memberName = activeMembersWithAccounts.find(m => Number(m.account_id) === Number(selectedAccountId))?.name;
    const ok = window.confirm(t("tree.archive.confirmArchive", { name: memberName }));
    if (!ok) return;

    setActionLoading(true);
    setError("");
    try {
      await archiveMemberAPI(Number(selectedAccountId), archiveReason.trim());
      setSelectedAccountId("");
      setArchiveReason("");
      setActiveTab("list");
      await onReload?.();
      await fetchArchived();
    } catch (err) {
      setError(err?.message || t("tree.archive.archiveError"));
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="fte-modalOverlay" role="presentation" onMouseDown={onClose}>
      <div className="fte-modal fte-archiveDialog" role="dialog" aria-modal="true" onMouseDown={(e) => e.stopPropagation()}>
        <div className="fte-modalHeader">
          <div>
            <span>{t("tree.archive.kicker")}</span>
            <h3>{t("tree.archive.title")}</h3>
          </div>
          <button type="button" className="fte-iconButton" onClick={onClose} title={t("common.close")}>
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="fte-archiveTabs">
          <button 
            type="button" 
            className={`fte-archiveTab ${activeTab === "list" ? "is-active" : ""}`}
            onClick={() => { setActiveTab("list"); setError(""); }}
          >
            <span className="material-symbols-outlined">inventory_2</span>
            {t("tree.archive.tabList", { count: archivedList.length })}
          </button>
          <button 
            type="button" 
            className={`fte-archiveTab ${activeTab === "archive" ? "is-active" : ""}`}
            onClick={() => { setActiveTab("archive"); setError(""); }}
          >
            <span className="material-symbols-outlined">archive</span>
            {t("tree.archive.tabArchive")}
          </button>
        </div>

        {error && (
          <div className="fte-archiveError" role="alert">
            <span className="material-symbols-outlined">error</span>
            <div>{error}</div>
          </div>
        )}

        {activeTab === "list" ? (
          <div className="fte-archiveContent">
            <div className="fte-archiveBulkActions">
              <button
                type="button"
                className="fte-deleteAllPermanentlyBtn"
                disabled={actionLoading || archivedList.length === 0}
                onClick={handleDeleteAllPermanently}
                title={t("tree.archive.deleteAllTitle")}
              >
                <span className="material-symbols-outlined">delete_sweep</span>
                {t("tree.archive.deleteAll")}
              </button>
            </div>
            <div className="fte-archiveSearch">
              <span className="material-symbols-outlined search-icon">search</span>
              <input 
                type="text" 
                placeholder={t("tree.archive.searchPlaceholder")} 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button type="button" className="clear-search-btn" onClick={() => setSearchQuery("")}>
                  <span className="material-symbols-outlined">close</span>
                </button>
              )}
            </div>

            {loading ? (
              <div className="fte-archiveLoading">
                <span className="material-symbols-outlined spinning-icon">sync</span>
                {t("tree.archive.loading")}
              </div>
            ) : filteredArchived.length === 0 ? (
              <div className="fte-archiveEmpty">
                <span className="material-symbols-outlined">folder_open</span>
                <p>{searchQuery ? t("tree.archive.noMatch") : t("tree.archive.empty")}</p>
              </div>
            ) : (
              <div className="fte-archiveList">
                {filteredArchived.map((item) => {
                  const personObj = typeof item.person_json === "string" ? JSON.parse(item.person_json) : item.person_json;
                  const accountObj = typeof item.account_json === "string" ? JSON.parse(item.account_json) : item.account_json;
                  const name = personObj ? fullName(personObj) : t("tree.archive.memberFallback");
                  const email = accountObj?.email || item.email || t("tree.archive.noEmail");
                  const dateStr = item.archived_at ? new Date(item.archived_at).toLocaleString(language === "en" ? "en-US" : "vi-VN") : t("tree.archive.unknownDate");

                  return (
                    <div key={item.id} className="fte-archiveItem">
                      <div className="fte-archiveItemInfo">
                        <div className="fte-archiveItemHeader">
                          <strong>{name}</strong>
                          <span className="fte-archiveItemEmail">{email}</span>
                        </div>
                        <div className="fte-archiveItemDetails">
                          <p>
                            <strong>{t("tree.archive.reasonLabel")}</strong>
                            <span className="reason-text">{item.archived_reason || t("tree.archive.noReason")}</span>
                          </p>
                          <p className="archived-meta">
                            <span>{t("tree.archive.archivedAt", { date: dateStr })}</span>
                          </p>
                        </div>
                      </div>
                      <div className="fte-archiveItemActions">
                        <button 
                          type="button" 
                          className="fte-restoreBtn" 
                          disabled={actionLoading}
                          onClick={() => handleRestore(item.id)}
                          title={t("tree.archive.restoreTitle")}
                        >
                          <span className="material-symbols-outlined">settings_backup_restore</span>
                          {t("tree.archive.restore")}
                        </button>
                        <button 
                          type="button" 
                          className="fte-deletePermanentlyBtn" 
                          disabled={actionLoading}
                          onClick={() => handleDeletePermanently(item.id)}
                          title={t("tree.archive.deletePermanentlyTitle")}
                        >
                          <span className="material-symbols-outlined">delete_forever</span>
                          {t("tree.archive.deletePermanently")}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <form className="fte-archiveForm" onSubmit={handleArchiveSubmit}>
            <div className="fte-archiveFormHelp">
              {t("tree.archive.formHelp")}
            </div>

            <label className="fte-archiveFormLabel">
              {t("tree.archive.selectMemberLabel")}
              <select 
                value={selectedAccountId} 
                onChange={(e) => setSelectedAccountId(e.target.value)}
                required
              >
                <option value="">{t("tree.archive.selectMemberOption")}</option>
                {activeMembersWithAccounts.map((m) => (
                  <option key={m.account_id} value={m.account_id}>
                    {m.name} ({m.email})
                  </option>
                ))}
              </select>
            </label>

            <label className="fte-archiveFormLabel">
              {t("tree.archive.reasonField")}
              <textarea 
                rows={4}
                value={archiveReason}
                onChange={(e) => setArchiveReason(e.target.value)}
                placeholder={t("tree.archive.reasonPlaceholder")}
                required
              />
            </label>

            <div className="fte-archiveFormFooter">
              <button 
                type="submit" 
                className="fte-primaryButton" 
                disabled={actionLoading || !selectedAccountId || !archiveReason.trim()}
              >
                <span className="material-symbols-outlined">archive</span>
                {t("tree.archive.archiveNow")}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

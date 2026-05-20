import { useEffect, useState, useMemo } from "react";
import { useLanguage } from "../../../../i18n/LanguageContext";
import { getArchivedMembersAPI, restoreArchivedMemberAPI, deleteArchivedMemberAPI, deleteAllArchivedMembersAPI, archiveMemberAPI } from "../../../../api/managerService";
import { fullName } from "../../utils/tree-editor/treePersonUtils";

export default function ArchivedMembersDialog({ people, onClose, onReload }) {
  const { t } = useLanguage();
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
      setError(err?.message || "Không thể lấy danh sách thành viên lưu trữ");
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
    const ok = window.confirm("Bạn có chắc chắn muốn phục hồi thành viên này trở lại cây gia phả?");
    if (!ok) return;

    setActionLoading(true);
    setError("");
    try {
      await restoreArchivedMemberAPI(archiveId);
      // Refresh tree and archived list
      await onReload?.();
      await fetchArchived();
    } catch (err) {
      setError(err?.message || "Không thể phục hồi thành viên");
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeletePermanently = async (archiveId) => {
    const ok = window.confirm("CẢNH BÁO: Hành động này sẽ xóa vĩnh viễn tài khoản và hồ sơ thành viên này khỏi hệ thống. Bạn có chắc muốn tiếp tục?");
    if (!ok) return;

    setActionLoading(true);
    setError("");
    try {
      await deleteArchivedMemberAPI(archiveId);
      await fetchArchived();
    } catch (err) {
      setError(err?.message || "Không thể xóa vĩnh viễn thành viên");
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteAllPermanently = async () => {
    if (!filteredArchived.length) return;

    const ok = window.confirm(
      `CẢNH BÁO: Hành động này sẽ xóa vĩnh viễn ${filteredArchived.length} bản ghi trong kho lưu trữ khỏi database. Không thể phục hồi. Bạn có chắc muốn tiếp tục?`
    );
    if (!ok) return;

    setActionLoading(true);
    setError("");
    try {
      await deleteAllArchivedMembersAPI();
      await onReload?.();
      await fetchArchived();
    } catch (err) {
      setError(err?.message || "Không thể xóa tất cả bản ghi lưu trữ");
    } finally {
      setActionLoading(false);
    }
  };

  const handleArchiveSubmit = async (e) => {
    e.preventDefault();
    if (!selectedAccountId) {
      setError("Vui lòng chọn một thành viên để lưu trữ.");
      return;
    }
    if (!archiveReason.trim()) {
      setError("Vui lòng nhập lý do lưu trữ.");
      return;
    }

    const memberName = activeMembersWithAccounts.find(m => Number(m.account_id) === Number(selectedAccountId))?.name;
    const ok = window.confirm(`Bạn có chắc chắn muốn lưu trữ thành viên "${memberName}"? Họ sẽ bị ẩn khỏi cây phả hệ và bị khóa đăng nhập.`);
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
      setError(err?.message || "Không thể lưu trữ thành viên");
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="fte-modalOverlay" role="presentation" onMouseDown={onClose}>
      <div className="fte-modal fte-archiveDialog" role="dialog" aria-modal="true" onMouseDown={(e) => e.stopPropagation()}>
        <div className="fte-modalHeader">
          <div>
            <span>Quản lý gia phả dòng họ</span>
            <h3>Kho Lưu Trữ Thành Viên</h3>
          </div>
          <button type="button" className="fte-iconButton" onClick={onClose} title={t("common.close") || "Đóng"}>
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
            Danh sách lưu trữ ({archivedList.length})
          </button>
          <button 
            type="button" 
            className={`fte-archiveTab ${activeTab === "archive" ? "is-active" : ""}`}
            onClick={() => { setActiveTab("archive"); setError(""); }}
          >
            <span className="material-symbols-outlined">archive</span>
            Đưa vào lưu trữ
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
                title="Xóa vĩnh viễn tất cả bản ghi trong kho lưu trữ"
              >
                <span className="material-symbols-outlined">delete_sweep</span>
                Xóa tất cả
              </button>
            </div>
            <div className="fte-archiveSearch">
              <span className="material-symbols-outlined search-icon">search</span>
              <input 
                type="text" 
                placeholder="Tìm thành viên trong kho lưu trữ..." 
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
                Đang tải danh sách lưu trữ...
              </div>
            ) : filteredArchived.length === 0 ? (
              <div className="fte-archiveEmpty">
                <span className="material-symbols-outlined">folder_open</span>
                <p>{searchQuery ? "Không tìm thấy thành viên trùng khớp." : "Kho lưu trữ hiện tại đang trống."}</p>
              </div>
            ) : (
              <div className="fte-archiveList">
                {filteredArchived.map((item) => {
                  const personObj = typeof item.person_json === "string" ? JSON.parse(item.person_json) : item.person_json;
                  const accountObj = typeof item.account_json === "string" ? JSON.parse(item.account_json) : item.account_json;
                  const name = personObj ? fullName(personObj) : "Thành viên";
                  const email = accountObj?.email || item.email || "Không có email";
                  const dateStr = item.archived_at ? new Date(item.archived_at).toLocaleString("vi-VN") : "Không rõ";

                  return (
                    <div key={item.id} className="fte-archiveItem">
                      <div className="fte-archiveItemInfo">
                        <div className="fte-archiveItemHeader">
                          <strong>{name}</strong>
                          <span className="fte-archiveItemEmail">{email}</span>
                        </div>
                        <div className="fte-archiveItemDetails">
                          <p>
                            <strong>Lý do: </strong>
                            <span className="reason-text">{item.archived_reason || "Không có lý do"}</span>
                          </p>
                          <p className="archived-meta">
                            <span>Lưu trữ lúc: {dateStr}</span>
                          </p>
                        </div>
                      </div>
                      <div className="fte-archiveItemActions">
                        <button 
                          type="button" 
                          className="fte-restoreBtn" 
                          disabled={actionLoading}
                          onClick={() => handleRestore(item.id)}
                          title="Phục hồi thành viên về cây phả hệ"
                        >
                          <span className="material-symbols-outlined">settings_backup_restore</span>
                          Phục hồi
                        </button>
                        <button 
                          type="button" 
                          className="fte-deletePermanentlyBtn" 
                          disabled={actionLoading}
                          onClick={() => handleDeletePermanently(item.id)}
                          title="Xóa vĩnh viễn tài khoản và hồ sơ thành viên"
                        >
                          <span className="material-symbols-outlined">delete_forever</span>
                          Xóa vĩnh viễn
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
              Đưa thành viên có tài khoản vào kho lưu trữ. Họ sẽ bị ẩn khỏi sơ đồ cây gia phả, danh sách hoạt động, và bị khóa quyền đăng nhập vào hệ thống.
            </div>

            <label className="fte-archiveFormLabel">
              Chọn thành viên cần lưu trữ
              <select 
                value={selectedAccountId} 
                onChange={(e) => setSelectedAccountId(e.target.value)}
                required
              >
                <option value="">-- Chọn thành viên --</option>
                {activeMembersWithAccounts.map((m) => (
                  <option key={m.account_id} value={m.account_id}>
                    {m.name} ({m.email})
                  </option>
                ))}
              </select>
            </label>

            <label className="fte-archiveFormLabel">
              Lý do lưu trữ
              <textarea 
                rows={4}
                value={archiveReason}
                onChange={(e) => setArchiveReason(e.target.value)}
                placeholder="Nhập lý do chi tiết..."
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
                Lưu trữ ngay
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

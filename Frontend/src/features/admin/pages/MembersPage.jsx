import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  getAdminAccounts,
  getAdminClans,
  createAdminAccount,
  updateAdminAccountAccess,
  deleteAdminAccount,
} from "../../../api/adminService";
import { formatDate } from "../../../shared/utils/dateFormat";
import { Link } from "react-router-dom";
import "./MembersPage.css";

const emptyForm = {
  account_id: null,
  email: "",
  password: "",
  display_name: "",
  surname: "",
  middle_name: "",
  first_name: "",
  role_id: "3",
  status: "active",
  clan_id: "",
};

const roleLabel = (roleId, t) => {
  const id = Number(roleId);
  if (id === 1) return t("admin.accounts.roles.admin");
  if (id === 2) return t("admin.accounts.roles.manager");
  return t("admin.accounts.roles.member");
};

const accountName = (a, t) =>
  a.display_name || [a.surname, a.middle_name, a.first_name].filter(Boolean).join(" ").trim() || a.email || t("admin.accounts.messages.defaultAccountName");

const statusLabel = (status, t) => {
  if (status === "active") return t("common.active");
  if (status === "pending") return t("common.pending");
  if (status === "rejected") return t("common.rejected");
  return status || "N/A";
};

const FOLDERS_PER_PAGE = 20;
const ACCOUNTS_PER_PAGE = 10;

const Pagination = ({ currentPage, totalItems, itemsPerPage, onPageChange, t }) => {
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  if (totalPages <= 1) return null;

  let startPage = Math.max(1, currentPage - 2);
  let endPage = Math.min(totalPages, startPage + 4);

  if (endPage - startPage < 4) {
    startPage = Math.max(1, endPage - 4);
  }

  const pages = [];
  for (let i = startPage; i <= endPage; i++) {
    pages.push(i);
  }

  return (
    <div className="admin-pagination">
      <button 
        type="button"
        className="pagination-btn"
        disabled={currentPage === 1} 
        onClick={() => onPageChange(1)}
      >
        <span className="material-symbols-outlined">first_page</span>
      </button>

      {totalPages > 5 && (
        <button 
          type="button"
          className="pagination-btn"
          disabled={currentPage === 1} 
          onClick={() => onPageChange(currentPage - 1)}
        >
          <span className="material-symbols-outlined">chevron_left</span>
        </button>
      )}

      {pages.map(p => (
        <button 
          type="button"
          key={p} 
          className={`pagination-number ${p === currentPage ? "active" : ""}`} 
          onClick={() => onPageChange(p)}
        >
          {p}
        </button>
      ))}

      {totalPages > 5 && (
        <button 
          type="button"
          className="pagination-btn"
          disabled={currentPage === totalPages} 
          onClick={() => onPageChange(currentPage + 1)}
        >
          <span className="material-symbols-outlined">chevron_right</span>
        </button>
      )}

      <button 
        type="button"
        className="pagination-btn"
        disabled={currentPage === totalPages} 
        onClick={() => onPageChange(totalPages)}
      >
        <span className="material-symbols-outlined">last_page</span>
      </button>
    </div>
  );
};

export default function MembersPage() {
  const { t, i18n } = useTranslation();
  const [accounts, setAccounts] = useState([]);
  const [clans, setClans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [clanSearchTerm, setClanSearchTerm] = useState("");
  const [filterRole, setFilterRole] = useState("all");
  const [selectedClan, setSelectedClan] = useState(null);
  const [error, setError] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const [currentFolderPage, setCurrentFolderPage] = useState(1);
  const [currentAccountPage, setCurrentAccountPage] = useState(1);

  // Premium State
  const [toast, setToast] = useState({ show: false, message: "", type: "success" });
  const [confirmDelete, setConfirmDelete] = useState({ show: false, account: null });

  // Auto-dismiss toast
  useEffect(() => {
    if (toast.show) {
      const timer = setTimeout(() => setToast(prev => ({ ...prev, show: false })), 4000);
      return () => clearTimeout(timer);
    }
  }, [toast.show]);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    setError("");
    try {
      const [aRes, cRes] = await Promise.all([getAdminAccounts(), getAdminClans()]);
      setAccounts(aRes.accounts || []);
      setClans(cRes.clans || []);
    } catch (err) {
      setError(err.message || t("admin.accounts.messages.loadError"));
    } finally {
      setLoading(false);
    }
  };

  const isAdminAccount = (account) => Number(account.role_id) === 1;

  const clanCards = useMemo(() => {
    const countMap = new Map();
    let normalAccountCount = 0;
    let adminAccountCount = 0;

    accounts.forEach((a) => {
      if (isAdminAccount(a)) {
        adminAccountCount += 1;
        return;
      }

      normalAccountCount += 1;
      const key = a.clan_id ? String(a.clan_id) : "none";
      countMap.set(key, (countMap.get(key) || 0) + 1);
    });

    return [
      { id: "admin", clan_name: t("admin.accounts.folders.adminFolder"), member_count: adminAccountCount, is_admin_folder: true },
      { id: "all", clan_name: t("admin.accounts.folders.allFolder"), member_count: normalAccountCount },
      ...clans.map((c) => ({ ...c, member_count: countMap.get(String(c.id)) || 0 })),
      { id: "none", clan_name: t("admin.accounts.folders.noneFolder"), member_count: countMap.get("none") || 0 },
    ];
  }, [accounts, clans, t]);

  const filteredClanCards = useMemo(() => {
    const q = clanSearchTerm.trim().toLowerCase();
    setCurrentFolderPage(1);
    if (!q) return clanCards;
    return clanCards.filter((clan) =>
      (clan.clan_name || "").toLowerCase().includes(q) || String(clan.member_count || 0).includes(q)
    );
  }, [clanCards, clanSearchTerm]);

  const pagedClanCards = useMemo(() => {
    const start = (currentFolderPage - 1) * FOLDERS_PER_PAGE;
    return filteredClanCards.slice(start, start + FOLDERS_PER_PAGE);
  }, [filteredClanCards, currentFolderPage]);

  const filteredAccounts = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    setCurrentAccountPage(1);
    return accounts.filter((a) => {
      const matchesSearch =
        !q ||
        (accountName(a).toLowerCase().includes(q)) ||
        (a.email || "").toLowerCase().includes(q) ||
        (a.clan_name || "").toLowerCase().includes(q);
      const matchesRole = filterRole === "all" || String(a.role_id) === filterRole;
      const matchesClan =
        selectedClan === "admin"
          ? isAdminAccount(a)
          : !isAdminAccount(a) && (
              selectedClan === "all" || selectedClan === null ||
              (selectedClan === "none" ? !a.clan_id : String(a.clan_id) === String(selectedClan))
            );
      return matchesSearch && matchesRole && matchesClan;
    });
  }, [accounts, searchTerm, filterRole, selectedClan, t]);

  const pagedAccounts = useMemo(() => {
    const start = (currentAccountPage - 1) * ACCOUNTS_PER_PAGE;
    return filteredAccounts.slice(start, start + ACCOUNTS_PER_PAGE);
  }, [filteredAccounts, currentAccountPage]);

  const openClanFolder = (clanId) => {
    setSelectedClan(String(clanId));
    setSearchTerm("");
    setFilterRole("all");
  };

  const backToClanFolders = () => {
    setSelectedClan(null);
    setSearchTerm("");
    setFilterRole("all");
  };

  const openAdd = () => {
    setForm({
      ...emptyForm,
      role_id: selectedClan === "admin" ? "1" : "3",
      clan_id: selectedClan && selectedClan !== "all" && selectedClan !== "none" && selectedClan !== "admin" ? selectedClan : "",
    });
    setShowModal(true);
  };

  const openEdit = (account) => {
    setForm({
      account_id: account.account_id,
      email: account.email || "",
      password: "",
      display_name: account.display_name || accountName(account, t),
      surname: account.surname || "",
      middle_name: account.middle_name || "",
      first_name: account.first_name || "",
      role_id: String(account.role_id || 3),
      status: account.status || "active",
      clan_id: account.clan_id ? String(account.clan_id) : "",
    });
    setShowModal(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        ...form,
        role_id: Number(form.role_id),
        clan_id: Number(form.role_id) === 1 ? null : (form.clan_id || null),
      };
      if (!payload.password) delete payload.password;
      if (form.account_id) {
        await updateAdminAccountAccess(form.account_id, payload);
      } else {
        await createAdminAccount(payload);
      }
      setToast({ show: true, message: form.account_id ? t("admin.accounts.messages.updated") : t("admin.accounts.messages.created"), type: "success" });
      setShowModal(false);
      setForm(emptyForm);
      await fetchData();
    } catch (err) {
      setToast({ show: true, message: err.message || t("admin.accounts.messages.saveError"), type: "error" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (account) => {
    setConfirmDelete({ show: true, account });
  };

  const confirmDeleteAccount = async () => {
    if (!confirmDelete.account) return;
    const account = confirmDelete.account;
    setConfirmDelete({ show: false, account: null });
    try {
      await deleteAdminAccount(account.account_id);
      setToast({ show: true, message: t("admin.accounts.messages.deleted"), type: "success" });
      await fetchData();
    } catch (err) {
      setToast({ show: true, message: err.message || t("admin.accounts.messages.deleteError"), type: "error" });
    }
  };

  if (loading) return <div className="loading-state">{t("admin.accounts.messages.loading")}</div>;

  const selectedClanName = clanCards.find((c) => String(c.id) === String(selectedClan))?.clan_name || t("admin.accounts.folders.allFolder");

  return (
    <section className="account-management-page">
      <header className="page-header">
        <div className="breadcrumb-nav">
          <Link to="/dashboard">{t("layout.adminMenu.overview")}</Link>
          <span className="separator">/</span>
          <span className="active">{t("layout.adminMenu.accounts")}</span>
        </div>
        <h1>{t("layout.adminMenu.accounts")}</h1>
      </header>

      {selectedClan === null ? (
        <>
          <div className="premium-toolbar">
            <div className="search-box-premium">
              <span className="material-symbols-outlined">search</span>
              <input
                type="text"
                placeholder={t("admin.accounts.folders.searchPlaceholder")}
                value={clanSearchTerm}
                onChange={(e) => setClanSearchTerm(e.target.value)}
              />
            </div>
          </div>

          <div className="clan-folder-grid">
            {pagedClanCards.map((clan) => (
              <div
                key={clan.id}
                className="clan-folder-card"
                onClick={() => openClanFolder(clan.id)}
              >
                <div className="folder-icon">
                    <span className="material-symbols-outlined">{clan.is_admin_folder ? "admin_panel_settings" : "folder_shared"}</span>
                    <span className="count-badge">{clan.member_count || 0}</span>
                </div>
                <div className="folder-info">
                    <h3>{clan.clan_name}</h3>
                    <p>{clan.is_admin_folder ? t("admin.accounts.folders.adminSubtitle") : t("admin.accounts.folders.countLabel", { count: clan.member_count })}</p>
                </div>
              </div>
            ))}
          </div>

          <Pagination 
            currentPage={currentFolderPage}
            totalItems={filteredClanCards.length}
            itemsPerPage={FOLDERS_PER_PAGE}
            onPageChange={setCurrentFolderPage}
            t={t}
          />

          {filteredClanCards.length === 0 && (
            <div className="empty-container">
              <span className="material-symbols-outlined">folder_off</span>
              <p>{t("admin.accounts.folders.empty")}</p>
            </div>
          )}
        </>
      ) : (
        <>
          <div className="premium-toolbar">
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <button type="button" className="action-btn-circle" onClick={backToClanFolders} title={t("admin.accounts.actions.back")}>
                    <span className="material-symbols-outlined">arrow_back</span>
                </button>
                <h2 style={{ margin: 0, color: '#4a160f', fontSize: '1.4rem' }}>{selectedClanName}</h2>
            </div>
            
            <div style={{ display: 'flex', gap: '10px' }}>
                <div className="search-box-premium">
                    <span className="material-symbols-outlined">search</span>
                    <input
                        type="text"
                        placeholder={t("admin.accounts.detail.searchPlaceholder")}
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <button className="admin-primary-btn" onClick={openAdd} style={{ padding: '0 20px', borderRadius: '12px' }}>
                    <span className="material-symbols-outlined">person_add</span>
                    {t("admin.accounts.actions.add")}
                </button>
            </div>
          </div>
        </>
      )}

      {error && <div className="task-alert is-error">{error}</div>}

      {selectedClan !== null && (
      <div className="premium-dark-glass">
        <table className="premium-table">
          <thead>
            <tr>
              <th>{t("admin.accounts.table.cols.account")}</th>
              <th>{t("admin.accounts.table.cols.role")}</th>
              <th>{t("admin.accounts.table.cols.status")}</th>
              <th>{t("admin.accounts.table.cols.createdAt")}</th>
              <th className="text-right">{t("admin.accounts.table.cols.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {pagedAccounts.map((a) => (
              <tr key={a.account_id}>
                <td>
                  <div className="user-cell">
                    <div className="user-avatar-circle">{accountName(a, t).charAt(0).toUpperCase()}</div>
                    <div className="user-info-text">
                      <span className="user-name">{accountName(a, t)}</span>
                      <span className="user-email">{a.email}</span>
                    </div>
                  </div>
                </td>
                <td><span className="role-tag">{roleLabel(a.role_id, t)}</span></td>
                <td><span className={`status-pill ${a.status || "active"}`}>{statusLabel(a.status, t)}</span></td>
                <td>{a.created_at ? formatDate(a.created_at, i18n) : "-"}</td>
                <td className="text-right">
                  <div className="action-buttons-grid">
                    <button className="action-btn-circle" title={t("admin.accounts.actions.edit")} onClick={() => openEdit(a)}>
                      <span className="material-symbols-outlined">edit</span>
                    </button>
                    {Number(a.role_id) !== 1 && (
                      <button className="action-btn-circle delete" title={t("admin.accounts.actions.delete")} onClick={() => handleDelete(a)}>
                        <span className="material-symbols-outlined">delete</span>
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <Pagination 
          currentPage={currentAccountPage}
          totalItems={filteredAccounts.length}
          itemsPerPage={ACCOUNTS_PER_PAGE}
          onPageChange={setCurrentAccountPage}
          t={t}
        />
        {filteredAccounts.length === 0 && (
          <div className="empty-container">
            <span className="material-symbols-outlined">manage_accounts</span>
            <p>{t("admin.accounts.table.empty")}</p>
          </div>
        )}
      </div>
      )}

      {showModal && (
        <div className="admin-modal-backdrop" onMouseDown={() => setShowModal(false)}>
          <form className="admin-account-modal" onSubmit={handleSave} onMouseDown={(e) => e.stopPropagation()}>
            <div className="admin-modal-head">
              <div>
                <h3>{form.account_id ? t("admin.accounts.modal.editTitle") : t("admin.accounts.modal.addTitle")}</h3>
                <p>{form.account_id ? t("admin.accounts.modal.editSubtitle") : t("admin.accounts.modal.addSubtitle")}</p>
              </div>
              <button type="button" className="modal-close-btn" onClick={() => setShowModal(false)}>×</button>
            </div>

            <div className="admin-form-grid">
              <label>{t("admin.accounts.modal.fields.email")}<input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
              <label>{form.account_id ? t("admin.accounts.modal.fields.passwordEdit") : t("admin.accounts.modal.fields.password")}<input required={!form.account_id} type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></label>
              <label>{t("admin.accounts.modal.fields.displayName")}<input value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} /></label>
              <label>{t("admin.accounts.modal.fields.surname")}<input value={form.surname} onChange={(e) => setForm({ ...form, surname: e.target.value })} /></label>
              <label>{t("admin.accounts.modal.fields.middleName")}<input value={form.middle_name} onChange={(e) => setForm({ ...form, middle_name: e.target.value })} /></label>
              <label>{t("admin.accounts.modal.fields.firstName")}<input value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} /></label>
              <label>{t("admin.accounts.modal.fields.role")}<select value={form.role_id} onChange={(e) => setForm({ ...form, role_id: e.target.value, clan_id: e.target.value === "1" ? "" : form.clan_id })}>{selectedClan === "admin" || form.role_id === "1" ? <option value="1">{t("admin.accounts.roles.admin")}</option> : null}<option value="2">{t("admin.accounts.roles.manager")}</option><option value="3">{t("admin.accounts.roles.member")}</option></select></label>
              <label>{t("admin.accounts.modal.fields.status")}<select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}><option value="active">{t("common.active")}</option><option value="pending">{t("common.pending")}</option><option value="rejected">{t("common.rejected")}</option></select></label>
              {form.role_id !== "1" && <label className="admin-form-full">{t("admin.accounts.modal.fields.clan")}<select value={form.clan_id} onChange={(e) => setForm({ ...form, clan_id: e.target.value })}><option value="">{t("admin.accounts.table.unassigned")}</option>{clans.map((c) => <option key={c.id} value={c.id}>{c.clan_name}</option>)}</select></label>}
            </div>

            <div className="admin-modal-actions">
              <button type="button" className="admin-secondary-btn" onClick={() => setShowModal(false)}>{t("admin.accounts.modal.actions.cancel")}</button>
              <button type="submit" className="admin-primary-btn" disabled={saving}>
                {saving ? t("admin.accounts.modal.actions.saving") : t("admin.accounts.modal.actions.save")}
              </button>
            </div>
          </form>
        </div>
      )}
    {/* 🌟 Premium Toast System */}
    <div className="premium-toast-system">
        <div className={`premium-toast ${toast.type} ${toast.show ? "show" : ""}`}>
            <span className="material-symbols-outlined toast-icon">
                {toast.type === "success" ? "check_circle" : "warning"}
            </span>
            <span className="toast-message">{toast.message}</span>
            <button className="toast-close-btn" onClick={() => setToast(prev => ({ ...prev, show: false }))}>
                <span className="material-symbols-outlined">close</span>
            </button>
        </div>
    </div>

    {/* 🌟 Premium Confirm Modal */}
    {confirmDelete.show && (
        <div className="premium-modal-overlay" onMouseDown={() => setConfirmDelete({ show: false, account: null })}>
            <div className="premium-confirm-card" onMouseDown={(e) => e.stopPropagation()}>
                <div className="warning-icon-wrapper">
                    <span className="material-symbols-outlined">warning</span>
                </div>
                <h3 style={{ color: '#4a160f', fontSize: '1.4rem', margin: '0 0 10px' }}>{t("admin.accounts.modal.deleteTitle") || "Xác nhận xóa"}</h3>
                <p style={{ color: '#7d5b43', lineHeight: 1.5 }}>
                    {t("admin.accounts.messages.deleteConfirm", { email: confirmDelete.account?.email })}
                </p>
                <div className="confirm-actions">
                    <button className="btn-premium-cancel" onClick={() => setConfirmDelete({ show: false, account: null })}>
                        {t("common.cancel")}
                    </button>
                    <button className="btn-premium-confirm" onClick={confirmDeleteAccount}>
                        {t("common.delete")}
                    </button>
                </div>
            </div>
        </div>
    )}
    </section>
  );
}

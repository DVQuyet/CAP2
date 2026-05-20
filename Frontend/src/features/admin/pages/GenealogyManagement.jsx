import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
    createAdminClan,
    deleteAdminClan,
    getAdminClans,
    getAdminClanTree,
    updateAdminClan,
} from "../../../api/adminService";
import FamilyTreeEditor from "../../genealogy/components/FamilyTreeEditor.jsx";
import { onSocketEvent } from "../../../services/socket";
import "./GenealogyManagement.css";

const emptyClanForm = {
    clan_name: "",
    history: "",
    hall_address: "",
    manager_email: "",
    manager_password: "",
    manager_surname: "",
    manager_middle_name: "",
    manager_first_name: "",
};

export default function GenealogyManagement() {
    const { t } = useTranslation();
    const [clans, setClans] = useState([]);
    const [selectedClanId, setSelectedClanId] = useState(null);
    const [treeData, setTreeData] = useState({ people: [], families: [], children: [] });
    const [clanInfo, setClanInfo] = useState(null);
    const [loading, setLoading] = useState(true);
    const [treeLoading, setTreeLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const [modalMode, setModalMode] = useState(null);
    const [clanForm, setClanForm] = useState(emptyClanForm);
    const [formError, setFormError] = useState("");
    const [saving, setSaving] = useState(false);
    const treeReloadTimerRef = useRef(null);

    const fetchClans = useCallback(async (preferredClanId = null) => {
        setLoading(true);
        try {
            const res = await getAdminClans();
            const nextClans = res.clans || [];
            setClans(nextClans);
            const currentStillExists = nextClans.some(clan => clan.id === selectedClanId);
            const nextSelectedId = preferredClanId || (currentStillExists ? selectedClanId : nextClans[0]?.id || null);
            setSelectedClanId(nextSelectedId);
            if (!nextSelectedId) {
                setClanInfo(null);
                setTreeData({ people: [], families: [], children: [], layoutSettings: { line_routes: {}, card_sizes: {} } });
            }
        } catch (err) {
            console.error(err);
            alert(err.message || t("admin.genealogy.messages.loadClansError"));
        } finally {
            setLoading(false);
        }
    }, [selectedClanId]);

    useEffect(() => {
        fetchClans();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const fetchTree = useCallback(async () => {
        if (!selectedClanId) return;
        setTreeLoading(true);
        try {
            const res = await getAdminClanTree(selectedClanId);
            setTreeData({
                people: res.treeMembers || [],
                families: res.families || [],
                children: res.children || [],
                layoutSettings: res.layoutSettings || { line_routes: {}, card_sizes: {} }
            });
            setClanInfo(res.clan);
        } catch (err) {
            console.error(err);
            setClanInfo(null);
            setTreeData({ people: [], families: [], children: [], layoutSettings: { line_routes: {}, card_sizes: {} } });
        } finally {
            setTreeLoading(false);
        }
    }, [selectedClanId]);

    useEffect(() => {
        fetchTree();
    }, [fetchTree]);

    const scheduleReloadTree = useCallback(() => {
        if (treeReloadTimerRef.current) {
            window.clearTimeout(treeReloadTimerRef.current);
        }

        treeReloadTimerRef.current = window.setTimeout(() => {
            treeReloadTimerRef.current = null;
            fetchTree();
        }, 500);
    }, [fetchTree]);

    useEffect(() => {
        const offTreeUpdated = onSocketEvent("tree_updated", (payload) => {
            if (
                payload?.clan_id &&
                selectedClanId &&
                Number(payload.clan_id) !== Number(selectedClanId)
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
    }, [scheduleReloadTree, selectedClanId]);

    useEffect(() => {
        return () => {
            if (treeReloadTimerRef.current) {
                window.clearTimeout(treeReloadTimerRef.current);
                treeReloadTimerRef.current = null;
            }
        };
    }, []);

    const filteredClans = useMemo(() => {
        const keyword = searchTerm.trim().toLowerCase();
        if (!keyword) return clans;
        return clans.filter(clan =>
            String(clan.clan_name || "").toLowerCase().includes(keyword)
            || String(clan.owner_name || "").toLowerCase().includes(keyword)
        );
    }, [clans, searchTerm]);

    const selectedClan = useMemo(
        () => clans.find(clan => clan.id === selectedClanId) || null,
        [clans, selectedClanId]
    );

    const openCreateModal = () => {
        setModalMode("create");
        setClanForm(emptyClanForm);
        setFormError("");
    };

    const openEditModal = (clan) => {
        setModalMode("edit");
        setClanForm({
            ...emptyClanForm,
            clan_name: clan?.clan_name || "",
            history: clan?.history || "",
            hall_address: clan?.hall_address || "",
        });
        setFormError("");
    };

    const closeModal = () => {
        if (saving) return;
        setModalMode(null);
        setFormError("");
    };

    const handleSubmitClan = async (event) => {
        event.preventDefault();
        const clanName = clanForm.clan_name.trim();
        if (!clanName) {
            setFormError(t("admin.genealogy.messages.clanNameRequired"));
            return;
        }
        if (modalMode === "create") {
            if (!clanForm.manager_email.trim() || !clanForm.manager_password.trim()) {
                setFormError(t("admin.genealogy.messages.managerAccountRequired"));
                return;
            }
            if (clanForm.manager_password.trim().length < 6) {
                setFormError(t("admin.genealogy.messages.passwordMinLength"));
                return;
            }
            if (!clanForm.manager_surname.trim() && !clanForm.manager_first_name.trim()) {
                setFormError(t("admin.genealogy.messages.managerNameRequired"));
                return;
            }
        }
        setSaving(true);
        setFormError("");
        try {
            if (modalMode === "edit" && selectedClanId) {
                await updateAdminClan(selectedClanId, { ...clanForm, clan_name: clanName });
                await fetchClans(selectedClanId);
            } else {
                const res = await createAdminClan({ ...clanForm, clan_name: clanName });
                await fetchClans(res.clan?.id || null);
            }
            setModalMode(null);
        } catch (err) {
            setFormError(err.message || t("admin.genealogy.messages.operationFailed"));
        } finally {
            setSaving(false);
        }
    };

    const handleDeleteClan = async (clan) => {
        if (!clan?.id) return;
        const ok = window.confirm(t("admin.genealogy.messages.deleteConfirm", { name: clan.clan_name }));
        if (!ok) return;
        try {
            await deleteAdminClan(clan.id);
            await fetchClans();
        } catch (err) {
            alert(err.message || t("admin.genealogy.messages.deleteError"));
        }
    };

    if (loading && clans.length === 0) return <div className="loading-container"><div className="loader"></div><p>{t("admin.genealogy.messages.loading")}</p></div>;

    return (
        <div className="genealogy-management premium-page">
            <aside className="clan-sidebar">
                <div className="sidebar-header">
                    <h3>{t("admin.genealogy.sidebar.title")}</h3>
                    <button className="add-clan-btn" onClick={openCreateModal} type="button">
                        <span className="material-symbols-outlined">add</span>
                        {t("admin.genealogy.sidebar.addBtn")}
                    </button>
                </div>

                <div className="clan-search-box">
                    <span className="material-symbols-outlined">search</span>
                    <input
                        value={searchTerm}
                        onChange={(event) => setSearchTerm(event.target.value)}
                        placeholder={t("admin.genealogy.sidebar.searchPlaceholder")}
                    />
                    {searchTerm && (
                        <button type="button" onClick={() => setSearchTerm("")} aria-label={t("admin.genealogy.sidebar.clearSearch")}>
                            <span className="material-symbols-outlined">close</span>
                        </button>
                    )}
                </div>

                <div className="clan-list">
                    {filteredClans.length === 0 ? (
                        <div className="empty-clan-list">{t("admin.genealogy.sidebar.empty")}</div>
                    ) : filteredClans.map(clan => (
                        <div
                            key={clan.id}
                            className={`clan-item ${selectedClanId === clan.id ? 'active' : ''}`}
                            onClick={() => setSelectedClanId(clan.id)}
                        >
                            <span className="material-symbols-outlined">account_balance</span>
                            <div className="clan-info">
                                <strong>{clan.clan_name}</strong>
                                <span>{t("admin.genealogy.sidebar.stats", { count: clan.member_count, managerCount: clan.manager_count || 0 })}</span>
                                {clan.owner_name ? <small>{t("admin.genealogy.sidebar.owner", { name: clan.owner_name })}</small> : null}
                            </div>
                            <div className="clan-actions" onClick={(event) => event.stopPropagation()}>
                                <button type="button" title={t("admin.genealogy.modal.editTitle")} onClick={() => { setSelectedClanId(clan.id); openEditModal(clan); }}>
                                    <span className="material-symbols-outlined">edit</span>
                                </button>
                                <button type="button" className="danger" title={t("admin.genealogy.messages.deleteError")} onClick={() => handleDeleteClan(clan)}>
                                    <span className="material-symbols-outlined">delete</span>
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            </aside>

            <main className="tree-view-main">
                <div className="tree-canvas-container">
                    {selectedClan ? (
                        <FamilyTreeEditor
                            clan={clanInfo}
                            people={treeData.people}
                            families={treeData.families}
                            children={treeData.children}
                            layoutSettings={treeData.layoutSettings}
                            loading={treeLoading}
                            onReload={scheduleReloadTree}
                        />
                    ) : (
                        <div className="empty-tree-state">{t("admin.genealogy.main.empty")}</div>
                    )}
                </div>
            </main>

            {modalMode && (
                <div className="clan-modal-backdrop" onClick={closeModal}>
                    <form className="clan-modal" onSubmit={handleSubmitClan} onClick={(event) => event.stopPropagation()}>
                        <button type="button" className="close-modal" onClick={closeModal}>
                            <span className="material-symbols-outlined">close</span>
                        </button>
                        <h3>{modalMode === "edit" ? t("admin.genealogy.modal.editTitle") : t("admin.genealogy.modal.createTitle")}</h3>
                        <label>
                            {t("admin.genealogy.modal.fields.clanName")} <b>*</b>
                            <input
                                value={clanForm.clan_name}
                                onChange={(event) => setClanForm(prev => ({ ...prev, clan_name: event.target.value }))}
                                placeholder={t("admin.genealogy.modal.fields.clanNamePlaceholder")}
                                autoFocus
                            />
                        </label>
                        <label>
                            {t("admin.genealogy.modal.fields.history")}
                            <textarea
                                value={clanForm.history}
                                onChange={(event) => setClanForm(prev => ({ ...prev, history: event.target.value }))}
                                placeholder={t("admin.genealogy.modal.fields.historyPlaceholder")}
                                rows={4}
                            />
                        </label>
                        <label>
                            {t("admin.genealogy.modal.fields.hallAddress")}
                            <input
                                value={clanForm.hall_address}
                                onChange={(event) => setClanForm(prev => ({ ...prev, hall_address: event.target.value }))}
                                placeholder={t("admin.genealogy.modal.fields.hallAddressPlaceholder")}
                            />
                        </label>
                        {modalMode === "create" && (
                            <div className="manager-account-section">
                                <div className="manager-section-title">
                                    <span className="material-symbols-outlined">manage_accounts</span>
                                    <div>
                                        <strong>{t("admin.genealogy.modal.fields.managerSection.title")}</strong>
                                        <p>{t("admin.genealogy.modal.fields.managerSection.subtitle")}</p>
                                    </div>
                                </div>
                                <label>
                                    {t("admin.genealogy.modal.fields.managerSection.email")} <b>*</b>
                                    <input
                                        type="email"
                                        value={clanForm.manager_email}
                                        onChange={(event) => setClanForm(prev => ({ ...prev, manager_email: event.target.value }))}
                                        placeholder="manager@example.com"
                                    />
                                </label>
                                <label>
                                    {t("admin.genealogy.modal.fields.managerSection.password")} <b>*</b>
                                    <input
                                        type="password"
                                        value={clanForm.manager_password}
                                        onChange={(event) => setClanForm(prev => ({ ...prev, manager_password: event.target.value }))}
                                        placeholder={t("admin.genealogy.modal.fields.managerSection.passwordHint")}
                                        autoComplete="new-password"
                                    />
                                </label>
                                <div className="manager-name-grid">
                                    <label>
                                        {t("admin.genealogy.modal.fields.managerSection.surname")} <b>*</b>
                                        <input
                                            value={clanForm.manager_surname}
                                            onChange={(event) => setClanForm(prev => ({ ...prev, manager_surname: event.target.value }))}
                                            placeholder={t("admin.genealogy.modal.fields.managerSection.surnamePlaceholder")}
                                        />
                                    </label>
                                    <label>
                                        {t("admin.genealogy.modal.fields.managerSection.middleName")}
                                        <input
                                            value={clanForm.manager_middle_name}
                                            onChange={(event) => setClanForm(prev => ({ ...prev, manager_middle_name: event.target.value }))}
                                            placeholder={t("admin.genealogy.modal.fields.managerSection.middleNamePlaceholder")}
                                        />
                                    </label>
                                    <label>
                                        {t("admin.genealogy.modal.fields.managerSection.firstName")} <b>*</b>
                                        <input
                                            value={clanForm.manager_first_name}
                                            onChange={(event) => setClanForm(prev => ({ ...prev, manager_first_name: event.target.value }))}
                                            placeholder={t("admin.genealogy.modal.fields.managerSection.firstNamePlaceholder")}
                                        />
                                    </label>
                                </div>
                            </div>
                        )}
                        {formError && <p className="clan-form-error">{formError}</p>}
                        <div className="clan-modal-actions">
                            <button type="button" className="secondary" onClick={closeModal} disabled={saving}>{t("admin.genealogy.modal.actions.cancel")}</button>
                            <button type="submit" disabled={saving}>
                                {saving ? t("admin.genealogy.modal.actions.saving") : t("admin.genealogy.modal.actions.save")}
                            </button>
                        </div>
                    </form>
                </div>
            )}
        </div>
    );
}

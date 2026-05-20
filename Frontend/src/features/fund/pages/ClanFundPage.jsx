import { useEffect, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { apiRequest, buildApiUrl } from "../../../services/api";
import { resolveImageUrl } from "../../../shared/utils/media";
import DateInput from "../../../shared/components/DateInput";
import { formatDateVN, isoToVietnamDate, vietnamDateToIso, pad2 } from "../../../shared/utils/dateFormat";
import "./FundDesign.css";
import FundAnalytics from "../components/FundAnalytics";

const getCurrentUserFromStorage = () => {
  const keys = ["user", "currentUser", "account", "authUser", "profile"];

  for (const key of keys) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;

      const parsed = JSON.parse(raw);

      if (parsed?.user) return parsed.user;
      if (parsed?.account) return parsed.account;

      return parsed;
    } catch (error) {
      // Bỏ qua key không phải JSON
    }
  }

  return null;
};

export default function ClanFundPage() {
  const { t } = useTranslation();
  const [campaigns, setCampaigns] = useState([]);
  const [members, setMembers] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [selectedCampaign, setSelectedCampaign] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showCampaignModal, setShowCampaignModal] = useState(false);
  const [showLedgerModal, setShowLedgerModal] = useState(false);
  const [showGeneralForm, setShowGeneralForm] = useState(false);
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [importing, setImporting] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState(null);
  const [showPendingModal, setShowPendingModal] = useState(false);
  const [filterYear, setFilterYear] = useState(new Date().getFullYear());
  const [filterMonth, setFilterMonth] = useState("");

  const [formData, setFormData] = useState({
    name: "",
    description: "",
    target_goal: 0,
    year: new Date().getFullYear(),
    amount_per_member: "",
    deadline: "",
    contribution_unit_definition: "males_only",
    bank_name: "",
    bank_account: "",
    bank_owner: "",
    qr_code_media_id: null
  });

  const currentUser = getCurrentUserFromStorage();

  const formatMoneyInput = (value) => {
    const digits = String(value ?? "").replace(/\D/g, "");
    if (!digits) return "";
    return new Intl.NumberFormat("en-US").format(Number(digits));
  };

  const moneyToNumber = (value) => Number(String(value ?? "").replace(/,/g, "")) || 0;

  const findMemberArray = (data) => {
    if (Array.isArray(data)) return data;

    if (!data || typeof data !== "object") return [];

    const directKeys = [
      "members",
      "people",
      "persons",
      "users",
      "data",
      "rows",
      "result",
      "items",
      "list"
    ];

    for (const key of directKeys) {
      if (Array.isArray(data[key])) return data[key];
    }

    for (const key of directKeys) {
      if (data[key] && typeof data[key] === "object") {
        const nested = findMemberArray(data[key]);
        if (nested.length) return nested;
      }
    }

    for (const value of Object.values(data)) {
      if (Array.isArray(value)) {
        const looksLikeMembers = value.some((item) => {
          if (!item || typeof item !== "object") return false;

          return (
            item.id ||
            item.person_id ||
            item.people_id ||
            item.member_id ||
            item.display_name ||
            item.full_name ||
            item.name ||
            item.person_name
          );
        });

        if (looksLikeMembers) return value;
      }

      if (value && typeof value === "object") {
        const nested = findMemberArray(value);
        if (nested.length) return nested;
      }
    }

    return [];
  };

  const normalizeMembers = (rawData) => {
    const rawMembers = findMemberArray(rawData);

    return rawMembers
      .map((m) => {
        const id =
          m.person_id ??
          m.people_id ??
          m.member_id ??
          m.id ??
          m.account_person_id;

        return {
          ...m,
          id,
          display_name:
            m.display_name ||
            m.full_name ||
            m.name ||
            m.person_name ||
            m.member_name ||
            m.username ||
            m.email ||
            (id ? t("fund.placeholders.memberId", { id }) : t("fund.placeholders.member"))
        };
      })
      .filter((m) => m.id);
  };

  const getManagerPersonId = () => {
    return (
      currentUser?.person_id ||
      currentUser?.person?.id ||
      members.find((m) => String(m.account_id) === String(currentUser?.id))?.id ||
      ""
    );
  };

  const initialGeneralTx = () => ({
    type: "expense",
    amount: "",
    note: "",
    purpose_note: "",
    method: "Tiền mặt",
    date: `${pad2(new Date().getDate())}/${pad2(new Date().getMonth() + 1)}/${new Date().getFullYear()}`,
    category: "Khác",
    person_id: "",
    recipient_person_id: "",
    paid_to_manager: false,
    campaign_id: ""
  });

  const translateCategory = (cat) => {
    if (cat === "Khác") return t("common.other");
    if (cat === "Sự kiện") return t("common.event");
    if (cat === "Khuyến học") return t("fund.modal.cashExpense.categories.study");
    if (cat === "Thăm hỏi") return t("fund.modal.cashExpense.categories.visit");
    if (cat === "Vận hành") return t("fund.modal.cashExpense.categories.ops");
    return cat;
  };

  const translateMethod = (m) => {
    if (m === "Tiền mặt") return t("fund.methods.cash");
    if (m === "Chuyển khoản") return t("fund.methods.transfer");
    return m;
  };

  const [generalTx, setGeneralTx] = useState(initialGeneralTx);

  const [approvalData, setApprovalData] = useState({
    transaction_id: null,
    status: "approved",
    manager_note: "",
    evidence_media_id: null,
    person_name: "",
    amount: 0
  });

  const [submitting, setSubmitting] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);

    try {
      const campData = await apiRequest("/api/manager/fund/campaigns");
      const txData = await apiRequest("/api/manager/fund/transactions");

      setCampaigns(campData.campaigns || []);
      setTransactions(txData.transactions || []);

      let memData = null;
      let normalizedMembers = [];

      const memberApis = [
        "/api/manager/members",
        "/api/manager/people",
        "/api/members",
        "/api/people"
      ];

      for (const url of memberApis) {
        try {
          const response = await apiRequest(url);
          const list = normalizeMembers(response);

          console.log("Member API:", url, response);
          console.log("Normalized members:", list);

          if (list.length > 0) {
            memData = response;
            normalizedMembers = list;
            break;
          }
        } catch (error) {
          console.warn("Could not load member list from:", url, error.message);
        }
      }

      setMembers(normalizedMembers);

      if (!normalizedMembers.length) {
        console.warn("Không có thành viên nào được trả về từ các API members.", memData);
      }
    } catch (error) {
      console.error("Error loading fund data:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleExportExcel = async (campaignId = null) => {
    try {
      const token = localStorage.getItem("auth_token");
      const url = campaignId
        ? buildApiUrl(`/api/manager/fund/export?campaign_id=${campaignId}`)
        : buildApiUrl(`/api/manager/fund/export?year=${new Date().getFullYear()}`);

      const response = await fetch(url, {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || t("fund.messages.exportError"));
      }

      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = downloadUrl;
      const filename = campaignId 
        ? t("fund.export.campaignFilename", { campaignId }) 
        : t("fund.export.yearlyFilename", { year: new Date().getFullYear() });
      link.setAttribute("download", filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(downloadUrl);
    } catch (error) {
      alert(t("fund.messages.exportError") + ": " + error.message);
    }
  };

  const handleImportExcel = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setImporting(true);

    const formData = new FormData();
    formData.append("file", file);

    try {
      await apiRequest("/api/manager/fund/import", {
        method: "POST",
        body: formData,
        headers: {}
      });

      alert(t("fund.messages.importSuccess"));
      loadData();
    } catch (error) {
      alert(t("fund.messages.importError") + ": " + error.message);
    } finally {
      setImporting(false);
    }
  };

  const handleQRUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const uploadData = new FormData();
    uploadData.append("image", file);
    uploadData.append("usage_type", "other");

    try {
      const res = await apiRequest("/api/upload", {
        method: "POST",
        body: uploadData,
        headers: {}
      });

      setFormData((prev) => ({
        ...prev,
        qr_code_media_id: res.mediaId
      }));
    } catch (error) {
      alert(t("fund.messages.qrUploadError"));
    }
  };

  const handleCreateCampaign = async (e) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      await apiRequest("/api/manager/fund/campaigns", {
        method: "POST",
        body: JSON.stringify({
          ...formData,
          amount_per_member: moneyToNumber(formData.amount_per_member),
          target_goal: moneyToNumber(formData.target_goal),
          deadline: vietnamDateToIso(formData.deadline) || null
        })
      });

      setShowCampaignModal(false);
      loadData();
    } catch (error) {
      alert(error.message || t("fund.messages.createCampaignError"));
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateCampaign = async (campaignId, updates) => {
    try {
      const cleanUpdates = { ...updates };

      if (cleanUpdates.amount_per_member !== undefined) {
        cleanUpdates.amount_per_member = moneyToNumber(cleanUpdates.amount_per_member);
      }

      await apiRequest(`/api/manager/fund/campaigns/${campaignId}`, {
        method: "PATCH",
        body: JSON.stringify(cleanUpdates)
      });

      if (selectedCampaign) {
        const data = await apiRequest(`/api/manager/fund/campaigns/${campaignId}`);
        setSelectedCampaign(data);
      }

      loadData();
    } catch (error) {
      alert(t("fund.messages.updateCampaignError"));
    }
  };

  const handleApprove = async (e) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      await apiRequest("/api/manager/fund/approve", {
        method: "POST",
        body: JSON.stringify({
          transaction_id: approvalData.transaction_id,
          status: approvalData.status,
          manager_note: approvalData.manager_note
        })
      });

      setShowApprovalModal(false);

      if (selectedCampaign) {
        const data = await apiRequest(`/api/manager/fund/campaigns/${selectedCampaign.campaign.id}`);
        setSelectedCampaign(data);
      }

      loadData();
    } catch (error) {
      alert(t("fund.messages.approveError"));
    } finally {
      setSubmitting(false);
    }
  };

  const handleGeneralTx = async (e) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      await apiRequest("/api/manager/fund/expense", {
        method: "POST",
        body: JSON.stringify({
          ...generalTx,
          amount: moneyToNumber(generalTx.amount),
          note: generalTx.note,
          recipient_note: generalTx.purpose_note,
          date: vietnamDateToIso(generalTx.date) || null,
          person_id: null,
          recipient_person_id: generalTx.recipient_person_id || null,
          paid_to_manager: generalTx.paid_to_manager,
          campaign_id: generalTx.campaign_id || null
        })
      });

      setShowGeneralForm(false);
      setGeneralTx(initialGeneralTx());
      loadData();
    } catch (error) {
      alert(error.message || t("fund.messages.expenseError"));
    } finally {
      setSubmitting(false);
    }
  };

  const openCampaignLedger = async (campaign) => {
    try {
      const data = await apiRequest(`/api/manager/fund/campaigns/${campaign.id}`);
      setSelectedCampaign(data);
      setShowLedgerModal(true);
    } catch (error) {
      alert(t("fund.messages.loadCampaignDetailError"));
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat("vi-VN", {
      style: "currency",
      currency: "VND"
    }).format(amount || 0);
  };

  const totalIncome = transactions
    .filter((tx) => tx.type === "income" && tx.status === "approved")
    .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);

  const totalExpense = transactions
    .filter((tx) => tx.type === "expense" && tx.status === "approved")
    .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);

  const currentBalance = totalIncome - totalExpense;

  const pendingTransactions = transactions.filter(tx => tx.status === 'pending');
  
  // Nhật ký chính: Ẩn các khoản thu từ đợt thu và đóng góp tự nguyện
  // Chỉ hiện: 
  // 1. Tất cả các khoản CHI (Expense) cho dù có thuộc đợt thu hay không
  // 2. Các khoản THU (Income) KHÔNG thuộc đợt thu và KHÔNG phải đóng góp tự nguyện (thu ngoài)
  const mainLedgerTransactions = transactions.filter(tx => tx.status === 'approved');

  const activeCampaignCount = campaigns.filter((c) => c.status === "open").length;

  const filteredCampaigns = campaigns.filter((c) => {
    const matchYear = !filterYear || String(c.year) === String(filterYear);
    let matchMonth = true;
    if (filterMonth) {
      // Extract month from deadline if available
      const month = c.deadline ? new Date(c.deadline).getMonth() + 1 : null;
      matchMonth = String(month) === String(filterMonth);
    }
    return matchYear && matchMonth;
  });

  const years = [...new Set(campaigns.map(c => c.year)), new Date().getFullYear()].sort((a, b) => b - a);

  return (
    <div className="fund-container glass-bg">
      <header className="glass-card premium-header">
        <div className="header-info">
          <span className="header-kicker">{t("fund.title")}</span>
          <h1>{t("fund.subtitle")}</h1>
          <p>{t("fund.description")}</p>
        </div>

        <div className="header-actions">
          <label className="btn-premium btn-outline">
            <span className="material-symbols-outlined">upload_file</span>
            {importing ? t("fund.actions.processing") : t("fund.actions.importExcel")}
            <input
              type="file"
              hidden
              accept=".xlsx,.xls"
              onChange={handleImportExcel}
              disabled={importing}
            />
          </label>

          <button className="btn-premium btn-outline" onClick={() => setShowPendingModal(true)} style={{ position: 'relative' }}>
            <span className="material-symbols-outlined">rule</span>
            {t("fund.actions.approveTransactions")}
            {pendingTransactions.length > 0 && (
              <span className="badge-count">{pendingTransactions.length}</span>
            )}
          </button>

          <button className="btn-premium btn-outline" onClick={() => handleExportExcel()}>
            <span className="material-symbols-outlined">download</span>
            {t("fund.actions.yearlyReport")}
          </button>

          <button className="btn-premium btn-gold" onClick={() => setShowGeneralForm(true)}>
            <span className="material-symbols-outlined">payments</span>
            {t("fund.actions.expenseCash")}
          </button>

          <button className="btn-premium btn-green" onClick={() => setShowCampaignModal(true)}>
            <span className="material-symbols-outlined">add_circle</span>
            {t("fund.actions.newCampaign")}
          </button>
        </div>
      </header>

      <div className="fund-quick-stats compact-stats">
        <div className="quick-stat-card balance-card">
          <div className="quick-stat-icon">
            <span className="material-symbols-outlined">account_balance_wallet</span>
          </div>
          <div>
            <p>{t("fund.stats.balance")}</p>
            <strong>{formatCurrency(currentBalance)}</strong>
          </div>
        </div>

        <div className="quick-stat-card income-card">
          <div className="quick-stat-icon">
            <span className="material-symbols-outlined">trending_up</span>
          </div>
          <div>
            <p>{t("fund.stats.totalIncome")}</p>
            <strong>{formatCurrency(totalIncome)}</strong>
          </div>
        </div>

        <div className="quick-stat-card expense-card">
          <div className="quick-stat-icon">
            <span className="material-symbols-outlined">trending_down</span>
          </div>
          <div>
            <p>{t("fund.stats.totalExpense")}</p>
            <strong>{formatCurrency(totalExpense)}</strong>
          </div>
        </div>

        <div className="quick-stat-card campaign-mini-card">
          <div className="quick-stat-icon">
            <span className="material-symbols-outlined">flag</span>
          </div>
          <div>
            <p>{t("fund.stats.activeCampaigns")}</p>
            <strong>{activeCampaignCount}</strong>
          </div>
        </div>
      </div>

      <div className="fund-analytics-compact">
        <FundAnalytics />
      </div>

      <div className="fund-main-grid">
        <section>
          <div className="section-header-v3">
            <h3 className="section-title">
              {filterMonth ? t("fund.campaigns.monthLabel", { month: filterMonth }) : t("fund.campaigns.title")}
              {filterYear && filterMonth ? `/${filterYear}` : filterYear ? ` ${t("common.year")} ${filterYear}` : ""}
            </h3>

            <div className="fund-filters">
              <div className="filter-item">
                <span className="material-symbols-outlined">calendar_today</span>
                <select value={filterYear} onChange={(e) => setFilterYear(e.target.value)}>
                  <option value="">{t("fund.campaigns.allYears")}</option>
                  {years.map(y => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>

              <div className="filter-item">
                <span className="material-symbols-outlined">filter_list</span>
                <select value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)}>
                  <option value="">{t("fund.campaigns.allMonths")}</option>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                    <option key={m} value={m}>{t("fund.campaigns.monthLabel", { month: m })}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="campaign-grid-v3 vertical-scroll">
            {loading ? (
              <div className="empty-state-card">{t("common.loading")}</div>
            ) : filteredCampaigns.length ? (
              filteredCampaigns.map((c) => (
                <div
                  key={c.id}
                  className="glass-card campaign-card-v3"
                  onClick={() => openCampaignLedger(c)}
                >
                  <div className="card-top">
                    <span className="year-pill">{c.year}</span>
                    <span className={`status-dot ${c.status}`}></span>
                  </div>

                  <h4>{c.name}</h4>

                  <div className="progress-container-v3">
                    <div
                      className="progress-bar-v3"
                      style={{
                        width: `${Math.min(
                          (c.collected_amount / (c.target_amount || 1)) * 100,
                          100
                        )}%`
                      }}
                    ></div>
                  </div>

                  <div className="card-bottom">
                    <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                      <span>{formatCurrency(c.collected_amount)}</span>
                      <span className="target-text">/ {formatCurrency(c.target_amount)}</span>
                    </div>
                  </div>
                  <div className="campaign-stats-mini" style={{ marginTop: '8px', fontSize: '0.75rem', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#e74c3c' }}>
                      <span>{t("fund.campaigns.spent")}:</span>
                      <strong>{formatCurrency(c.spent_amount)}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#27ae60', borderTop: '1px solid rgba(0,0,0,0.05)', paddingTop: '4px' }}>
                      <span>{t("fund.campaigns.balance")}:</span>
                      <strong>{formatCurrency(c.balance)}</strong>
                    </div>
                  </div>

                  <div className="campaign-card-footer">
                    <div className="completion-rate">
                      {((c.collected_amount / (c.target_amount || 1)) * 100).toFixed(1)}%
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="empty-state-card">{t("fund.campaigns.noCampaignFound")}</div>
            )}
          </div>
        </section>

        <section>
          <h3 className="section-title">{t("fund.ledger.title")}</h3>

          <div className="glass-card ledger-box" style={{padding: 0, overflow: 'hidden'}}>
            <div className="ledger-scroll-wrapper" style={{maxHeight: '500px', overflowY: 'auto'}}>
            <table className="fund-table-v3">
              <thead>
                <tr>
                  <th>{t("fund.ledger.transaction")}</th>
                  <th>{t("fund.ledger.amount")}</th>
                  <th>{t("fund.ledger.method")}</th>
                </tr>
              </thead>

              <tbody>
                {mainLedgerTransactions.map((tx) => (
                  <tr key={`${tx.type}-${tx.id}`} onClick={() => setSelectedTransaction(tx)} style={{ cursor: 'pointer' }}>
                    <td>
                      <div className="tx-name">{tx.note || t("fund.ledger.generalExpense")}</div>

                      <div className="tx-date">
                        {tx.person_name && (
                          <span className="tx-person-pill">{tx.person_name}</span>
                        )}
                        <span className="method-pill" style={{ background: 'rgba(52, 152, 219, 0.1)', color: '#2980b9' }}>
                          {tx.campaign_name || t("fund.ledger.generalFund")}
                        </span>
                        {formatDateVN(tx.date)}
                      </div>
                    </td>

                    <td className={`tx-val ${tx.type}`}>
                      {tx.type === "income" ? "+" : "-"}
                      {formatCurrency(tx.amount)}
                    </td>

                    <td>
                      <span className="method-pill" style={{ 
                        background: tx.method === "Chuyển khoản" ? 'rgba(52, 152, 219, 0.1)' : 'rgba(39, 174, 96, 0.1)', 
                        color: tx.method === "Chuyển khoản" ? '#2980b9' : '#27ae60' 
                      }}>
                        {translateMethod(tx.method || "Tiền mặt")}
                      </span>
                    </td>
                  </tr>
                ))}

                {!mainLedgerTransactions.length && (
                  <tr>
                    <td colSpan="3" className="table-empty">
                      {t("fund.ledger.noTransaction")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            </div>
          </div>
        </section>
      </div>

      {showCampaignModal && (
        <div className="fund-modal-v2" onClick={() => setShowCampaignModal(false)}>
          <div className="modal-glass fund-create-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header-v2">
              <div>
                <h3>{t("fund.modal.createCampaign.title")}</h3>
                <p className="modal-subtitle">{t("fund.modal.createCampaign.subtitle")}</p>
              </div>

              <button onClick={() => setShowCampaignModal(false)} className="close-btn">
                &times;
              </button>
            </div>

            <div className="modal-body-v2">
              <form onSubmit={handleCreateCampaign} className="premium-form">
                <div className="form-row-2">
                  <div className="form-group">
                    <label>{t("fund.modal.form.campaignName")}</label>
                    <input
                      type="text"
                      required
                      placeholder={t("fund.modal.placeholders.campaignName")}
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    />
                  </div>

                  <div className="form-group">
                    <label>{t("fund.modal.form.year")}</label>
                    <input
                      type="number"
                      required
                      value={formData.year}
                      onChange={(e) => setFormData({ ...formData, year: e.target.value })}
                    />
                  </div>
                </div>

                <div className="form-row-2">
                  <div className="form-group">
                    <label>{t("fund.modal.form.targetGoal")}</label>
                    <input
                      type="text"
                      placeholder={t("fund.modal.placeholders.targetGoal")}
                      value={formatMoneyInput(formData.target_goal)}
                      onChange={(e) => setFormData({ ...formData, target_goal: moneyToNumber(e.target.value) })}
                    />
                  </div>

                  <div className="form-group">
                    <label>{t("fund.modal.form.amountPerMember")}</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      placeholder={t("fund.modal.placeholders.amountPerMember")}
                      value={formData.amount_per_member}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          amount_per_member: formatMoneyInput(e.target.value)
                        })
                      }
                    />
                  </div>
                </div>

                <div className="form-row-2">
                  <div className="form-group">
                    <label>{t("fund.modal.form.deadline")}</label>
                    <DateInput
                      required
                      value={formData.deadline}
                      onChange={(e) => setFormData({ ...formData, deadline: e.target.value })}
                    />
                  </div>
                </div>

                <h4 className="sub-title-v3">{t("fund.modal.form.paymentInfo")}</h4>

                <div className="form-row-2">
                  <div className="form-group">
                    <label>{t("fund.modal.form.bankName")}</label>
                    <input
                      type="text"
                      placeholder={t("fund.modal.form.bankName")}
                      value={formData.bank_name}
                      onChange={(e) => setFormData({ ...formData, bank_name: e.target.value })}
                    />
                  </div>

                  <div className="form-group">
                    <label>{t("fund.modal.form.bankAccount")}</label>
                    <input
                      type="text"
                      placeholder="10293..."
                      value={formData.bank_account}
                      onChange={(e) =>
                        setFormData({ ...formData, bank_account: e.target.value })
                      }
                    />
                  </div>
                </div>

                <div className="form-row-2">
                  <div className="form-group">
                    <label>{t("fund.modal.form.bankOwner")}</label>
                    <input
                      type="text"
                      placeholder="NGUYEN VAN A"
                      value={formData.bank_owner}
                      onChange={(e) => setFormData({ ...formData, bank_owner: e.target.value })}
                    />
                  </div>

                  <div className="form-group">
                    <label>{t("fund.modal.form.qrCode")}</label>

                    <div className="upload-box-v2">
                      <input type="file" hidden id="qr-upload" onChange={handleQRUpload} />

                      <label htmlFor="qr-upload" className="upload-label-v3">
                        <span className="material-symbols-outlined">qr_code_2</span>
                        {formData.qr_code_media_id ? t("common.uploaded") : t("common.selectImage")}
                      </label>
                    </div>
                  </div>
                </div>

                <div className="form-group">
                  <label>{t("fund.modal.form.targetGoal")} (VND)</label>
                  <input
                    type="text"
                    value={formData.target_goal}
                    onChange={(e) => setFormData({ ...formData, target_goal: formatMoneyInput(e.target.value) })}
                    placeholder={t("fund.modal.placeholders.targetGoal")}
                  />
                  <p style={{ fontSize: '0.75rem', color: '#666', marginTop: '4px', marginBottom: '1rem' }}>{t("fund.modal.createCampaign.goalHelp")}</p>

                  <label>{t("fund.modal.form.contributionUnit")}</label>
                  <select
                    value={formData.contribution_unit_definition}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        contribution_unit_definition: e.target.value
                      })
                    }
                  >
                    <option value="males_only">{t("fund.modal.form.contributionUnits.males_only")}</option>
                    <option value="adults_all">{t("fund.modal.form.contributionUnits.adults_all")}</option>
                    <option value="per_family">{t("fund.modal.form.contributionUnits.per_family")}</option>
                  </select>
                </div>

                <div className="modal-footer">
                  <button
                    type="button"
                    onClick={() => setShowCampaignModal(false)}
                    className="btn-premium btn-outline"
                  >
                    {t("common.cancel")}
                  </button>

                  <button type="submit" className="btn-premium btn-green" disabled={submitting}>
                    {t("fund.actions.newCampaign")}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {showLedgerModal && selectedCampaign && (
        <div className="fund-modal-v2" onClick={() => setShowLedgerModal(false)}>
          <div className="modal-glass ledger-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header-v2">
              <div>
                <h3>{t("fund.actions.manage")}: {selectedCampaign.campaign.name}</h3>
                <p className="modal-subtitle">{t("fund.modal.ledger.subtitle")}</p>
              </div>

              <div className="header-actions-v2">
                <button
                  className="btn-export-v2"
                  onClick={() => handleExportExcel(selectedCampaign.campaign.id)}
                >
                  {t("fund.actions.exportExcel")}
                </button>

                <button onClick={() => setShowLedgerModal(false)} className="close-btn">
                  &times;
                </button>
              </div>
            </div>

            <div className="modal-body-v2">
              <div className="mgmt-toolbar glass-card">
                <div className="mgmt-item">
                  <label>{t("fund.modal.form.status")}</label>

                  <select
                    value={selectedCampaign.campaign.status}
                    onChange={(e) =>
                      handleUpdateCampaign(selectedCampaign.campaign.id, {
                        status: e.target.value
                      })
                    }
                  >
                    <option value="open">{t("fund.modal.form.statuses.open")}</option>
                    <option value="closed">{t("fund.modal.form.statuses.closed")}</option>
                  </select>
                </div>

                <div className="mgmt-item">
                  <label>{t("fund.modal.form.currentContributionRate")}</label>

                  <div className="input-with-btn">
                      <input
                        type="text"
                        inputMode="numeric"
                        defaultValue={formatMoneyInput(selectedCampaign.campaign.amount_per_member)}
                        onBlur={(e) =>
                          handleUpdateCampaign(selectedCampaign.campaign.id, {
                            amount_per_member: moneyToNumber(e.target.value)
                          })
                        }
                      />
                      <span>{t("fund.modal.form.amountPerMemberLabel")}</span>
                  </div>
                </div>

                {selectedCampaign.campaign.qr_code_media_id && (
                  <div className="mgmt-item">
                    <label>{t("fund.modal.form.qrCodeLabel")}</label>

                    <div className="mini-qr">
                      <img
                        src={resolveImageUrl({
                          mediaId: selectedCampaign.campaign.qr_code_media_id
                        })}
                        alt="QR"
                        onClick={() =>
                          window.open(
                            resolveImageUrl({
                              mediaId: selectedCampaign.campaign.qr_code_media_id
                            }),
                            "_blank"
                          )
                        }
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="ledger-stats-v3">
                <div className="l-stat">
                  <span>{t("fund.modal.form.collected")}</span>
                  <strong>{selectedCampaign.stats.paid_count}</strong>
                </div>

                <div className="l-stat">
                  <span>{t("fund.modal.form.collectedTotal")}</span>
                  <strong>{formatCurrency(selectedCampaign.stats.collected_amount)}</strong>
                </div>

                <div className="l-stat">
                  <span>{t("fund.modal.form.completionRate")}</span>
                  <strong>{selectedCampaign.stats.completion_rate.toFixed(1)}%</strong>
                </div>
              </div>

              <div className="ledger-table-wrapper">
                <table className="fund-table-v3">
                  <thead>
                    <tr>
                      <th>{t("fund.modal.form.payer")}</th>
                      <th>{t("fund.modal.form.date")}</th>
                      <th>{t("fund.modal.form.amount")}</th>
                      <th>{t("fund.modal.form.action")}</th>
                    </tr>
                  </thead>

                  <tbody>
                    {selectedCampaign.transactions.map((tx) => (
                      <tr key={`${tx.type}-${tx.id}`}>
                        <td>
                          <strong>{tx.person_name || '---'}</strong>
                          <div style={{ fontSize: '0.75rem', color: '#666' }}>{tx.note}</div>
                        </td>

                        <td>{formatDateVN(tx.contribution_date || tx.created_at)}</td>

                        <td className={`tx-val ${tx.type}`}>
                          {tx.type === 'income' ? '+' : '-'}{formatCurrency(tx.amount)}
                        </td>

                        <td>
                          {tx.status === "pending" ? (
                            <button
                              onClick={() => {
                                setApprovalData({
                                  transaction_id: tx.id,
                                  status: "approved",
                                  manager_note: "",
                                  evidence_media_id: tx.evidence_media_id,
                                  person_name: tx.person_name,
                                  amount: tx.amount
                                });

                                setShowApprovalModal(true);
                              }}
                              className="btn-approve-v3-active"
                            >
                              {t("fund.modal.form.approveNow")}
                            </button>
                          ) : (
                            <span className="done-pill">{t("fund.modal.form.completed")}</span>
                          )}
                        </td>
                      </tr>
                    ))}

                    {!selectedCampaign.transactions.length && (
                      <tr>
                        <td colSpan="4" className="table-empty">
                          {t("fund.ledger.noTransactionInCampaign")}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {showApprovalModal && (
        <div className="fund-modal-v2" onClick={() => setShowApprovalModal(false)}>
          <div className="modal-glass approval-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header-v2">
              <div>
                <h3>{t("fund.modal.approval.title")}</h3>
                <p className="modal-subtitle">{t("fund.modal.approval.subtitle")}</p>
              </div>

              <button onClick={() => setShowApprovalModal(false)} className="close-btn">
                &times;
              </button>
            </div>

            <div className="modal-body-v2">
              <div className="approval-info glass-card">
                <div className="info-row">
                  <span>{t("fund.modal.approval.member")}:</span>
                  <strong>{approvalData.person_name}</strong>
                </div>

                <div className="info-row">
                  <span>{t("fund.modal.approval.amount")}:</span>
                  <strong style={{ color: "#2ecc71" }}>
                    {formatCurrency(approvalData.amount)}
                  </strong>
                </div>
              </div>

              {approvalData.evidence_media_id && (
                <div className="evidence-view">
                  <label>{t("fund.modal.approval.bill")}</label>
                  <img
                    src={resolveImageUrl({
                      mediaId: approvalData.evidence_media_id
                    })}
                    alt="Evidence"
                    className="bill-img-v3"
                  />
                </div>
              )}

              <form onSubmit={handleApprove} className="premium-form">
                <div className="form-group">
                  <label>{t("fund.modal.approval.note")}</label>
                  <textarea
                    value={approvalData.manager_note}
                    onChange={(e) =>
                      setApprovalData({
                        ...approvalData,
                        manager_note: e.target.value
                      })
                    }
                    rows="2"
                    placeholder={t("fund.modal.approval.notePlaceholder")}
                  ></textarea>
                </div>

                <div className="modal-footer">
                  <button
                    type="button"
                    onClick={() => setShowApprovalModal(false)}
                    className="btn-premium btn-outline"
                  >
                    {t("fund.modal.approval.waitLater")}
                  </button>

                  <button type="submit" className="btn-premium btn-green" disabled={submitting}>
                    {t("fund.modal.approval.confirm")}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {showGeneralForm && (
        <div className="fund-modal-v2" onClick={() => setShowGeneralForm(false)}>
          <div className="modal-glass cash-expense-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header-v2">
              <div>
                <h3>{t("fund.modal.cashExpense.title")}</h3>
                <p className="modal-subtitle">
                  {t("fund.modal.cashExpense.subtitle")}
                </p>
              </div>

              <button onClick={() => setShowGeneralForm(false)} className="close-btn">
                &times;
              </button>
            </div>

            <div className="modal-body-v2">
              <form onSubmit={handleGeneralTx} className="premium-form">
                <div className="expense-summary-card">
                  <span className="material-symbols-outlined">payments</span>

                  <div>
                    <strong>{t("fund.modal.cashExpense.summaryTitle")}</strong>
                    <p>{t("fund.modal.cashExpense.summaryDesc")}</p>
                  </div>
                </div>

                <div className="form-row-2">
                  <div className="form-group">
                    <label>{t("fund.modal.cashExpense.amount")}</label>

                    <input
                      type="text"
                      inputMode="numeric"
                      required
                      value={generalTx.amount}
                      onChange={(e) =>
                        setGeneralTx({
                          ...generalTx,
                          amount: formatMoneyInput(e.target.value)
                        })
                      }
                      placeholder="1,000"
                    />
                  </div>

                  <div className="form-group">
                    <label>{t("fund.modal.cashExpense.date")}</label>

                    <DateInput
                      required
                      value={generalTx.date}
                      onChange={(e) =>
                        setGeneralTx({
                          ...generalTx,
                          date: e.target.value
                        })
                      }
                    />
                  </div>
                </div>

                <div className="form-row-2">
                  <div className="form-group">
                    <label>{t("fund.modal.cashExpense.category")}</label>

                    <select
                      value={generalTx.category}
                      onChange={(e) =>
                        setGeneralTx({
                          ...generalTx,
                          category: e.target.value
                        })
                      }
                    >
                      <option value="Khác">{t("common.other")}</option>
                      <option value="Sự kiện">{t("common.event")}</option>
                      <option value="Khuyến học">{t("fund.modal.cashExpense.categories.study")}</option>
                      <option value="Thăm hỏi">{t("fund.modal.cashExpense.categories.visit")}</option>
                      <option value="Vận hành">{t("fund.modal.cashExpense.categories.ops")}</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label>{t("fund.modal.cashExpense.campaign")}</label>

                    <select
                      value={generalTx.campaign_id}
                      onChange={(e) =>
                        setGeneralTx({
                          ...generalTx,
                          campaign_id: e.target.value
                        })
                      }
                    >
                      <option value="">{t("fund.modal.cashExpense.noCampaign")}</option>

                      {campaigns.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} ({c.year})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="recipient-panel">
                  <div className="recipient-panel-head">
                    <div>
                      <strong>{t("fund.modal.cashExpense.recipientTitle")}</strong>
                      <span>
                        {t("fund.modal.cashExpense.recipientDesc")}
                      </span>
                    </div>

                    <button
                      type="button"
                      className={`quick-manager-btn ${generalTx.paid_to_manager ? "active" : ""}`}
                      onClick={() => {
                        const managerPersonId = getManagerPersonId();

                        if (!managerPersonId) {
                          alert(
                            t("fund.messages.managerPersonIdNotFound")
                          );
                          return;
                        }

                        setGeneralTx({
                          ...generalTx,
                          recipient_person_id: String(managerPersonId),
                          paid_to_manager: true
                        });
                      }}
                    >
                      <span className="material-symbols-outlined">admin_panel_settings</span>
                      {t("fund.modal.cashExpense.quickManager")}
                    </button>
                  </div>

                  <div className="form-group">
                    <label>{t("fund.modal.cashExpense.recipient")}</label>

                    <select
                      value={generalTx.recipient_person_id}
                      disabled={!members.length}
                      onChange={(e) => {
                        const managerPersonId = getManagerPersonId();

                        setGeneralTx({
                          ...generalTx,
                          recipient_person_id: e.target.value,
                          paid_to_manager: String(e.target.value) === String(managerPersonId)
                        });
                      }}
                    >
                      <option value="">
                        {members.length
                          ? t("fund.modal.cashExpense.selectRecipient")
                          : t("fund.modal.cashExpense.loadingMembers")}
                      </option>

                      {members.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.display_name}
                        </option>
                      ))}
                    </select>

                    {!members.length && (
                      <div className="member-help-text">
                        {t("fund.modal.cashExpense.noMemberData")}
                      </div>
                    )}
                  </div>

                  <div className="form-group">
                    <label>{t("fund.modal.cashExpense.purpose")}</label>

                    <textarea
                      value={generalTx.purpose_note}
                      onChange={(e) =>
                        setGeneralTx({
                          ...generalTx,
                          purpose_note: e.target.value
                        })
                      }
                      rows="2"
                      placeholder={t("fund.modal.cashExpense.purposePlaceholder")}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label>{t("fund.modal.cashExpense.internalNote")}</label>

                  <textarea
                    required
                    value={generalTx.note}
                    onChange={(e) =>
                      setGeneralTx({
                        ...generalTx,
                        note: e.target.value
                      })
                    }
                    rows="2"
                    placeholder={t("fund.modal.cashExpense.internalNotePlaceholder")}
                  />
                </div>

                <button
                  type="submit"
                  className="btn-premium btn-green submit-wide"
                  disabled={submitting}
                >
                  {t("fund.modal.cashExpense.confirm")}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Transaction Detail Modal */}
      {selectedTransaction && (
        <div className="fund-modal-v2" onClick={() => setSelectedTransaction(null)}>
          <div className="modal-glass" style={{ maxWidth: '450px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header-v2">
              <h3>{t("fund.modal.transactionDetail.title")}</h3>
              <button onClick={() => setSelectedTransaction(null)} className="close-btn">&times;</button>
            </div>
            <div className="modal-body-v2">
              <div className="tx-detail-v3">
                <div className="detail-row">
                  <label>{t("fund.modal.transactionDetail.type")}:</label>
                  <span className={`pill ${selectedTransaction.type}`}>{selectedTransaction.type === 'income' ? t("fund.modal.transactionDetail.income") : t("fund.modal.transactionDetail.expense")}</span>
                </div>
                <div className="detail-row">
                  <label>{t("fund.modal.transactionDetail.amount")}:</label>
                  <strong style={{ color: selectedTransaction.type === 'income' ? '#2ecc71' : '#ff7675' }}>
                    {formatCurrency(selectedTransaction.amount)}
                  </strong>
                </div>
                <div className="detail-row">
                  <label>{t("fund.modal.transactionDetail.date")}:</label>
                  <span>{formatDateVN(selectedTransaction.date)}</span>
                </div>
                <div className="detail-row">
                  <label>{t("fund.modal.transactionDetail.method")}:</label>
                  <span>{translateMethod(selectedTransaction.method)}</span>
                </div>
                <div className="detail-row">
                  <label>{t("fund.modal.transactionDetail.content")}:</label>
                  <span>{selectedTransaction.note}</span>
                </div>
                <div className="detail-row">
                  <label>{t("fund.modal.transactionDetail.category")}:</label>
                  <span>{translateCategory(selectedTransaction.category || "Khác")}</span>
                </div>
                {selectedTransaction.person_name && (
                  <div className="detail-row">
                    <label>{selectedTransaction.type === 'income' ? t("fund.modal.transactionDetail.payer") : t("fund.modal.transactionDetail.recipient")}:</label>
                    <span>{selectedTransaction.person_name}</span>
                  </div>
                )}
                {selectedTransaction.manager_note && (
                  <div className="detail-row" style={{ marginTop: '1rem', borderTop: '1px solid rgba(0,0,0,0.1)', paddingTop: '1rem' }}>
                    <label>{t("fund.modal.transactionDetail.managerNote")}:</label>
                    <p style={{ fontStyle: 'italic', color: 'rgba(0,0,0,0.7)' }}>{selectedTransaction.manager_note}</p>
                  </div>
                )}
                {selectedTransaction.recipient_note && (
                  <div className="detail-row" style={{ marginTop: '1rem', borderTop: '1px solid rgba(0,0,0,0.1)', paddingTop: '1rem' }}>
                    <label>{t("fund.modal.transactionDetail.recipientNote")}:</label>
                    <p style={{ fontStyle: 'italic', color: 'rgba(0,0,0,0.7)' }}>{selectedTransaction.recipient_note}</p>
                  </div>
                )}
                {selectedTransaction.evidence_media_id && (
                  <div className="detail-row" style={{ flexDirection: 'column', alignItems: 'flex-start', marginTop: '1rem' }}>
                    <label>{t("fund.modal.transactionDetail.bill")}:</label>
                    <img
                      src={resolveImageUrl({ mediaId: selectedTransaction.evidence_media_id })}
                      alt="Bill"
                      style={{ width: '100%', borderRadius: '12px', marginTop: '8px', border: '1px solid #ddd' }}
                      onClick={() => window.open(resolveImageUrl({ mediaId: selectedTransaction.evidence_media_id }), '_blank')}
                    />
                  </div>
                )}
                {selectedTransaction.status === 'pending' && (
                  <div className="detail-actions" style={{ marginTop: '1.5rem', display: 'flex', gap: '10px' }}>
                    <button
                      className="btn-premium btn-green"
                      style={{ flex: 1 }}
                      onClick={() => {
                        setApprovalData({
                          transaction_id: selectedTransaction.id,
                          status: 'approved',
                          manager_note: '',
                          evidence_media_id: selectedTransaction.evidence_media_id,
                          person_name: selectedTransaction.person_name,
                          amount: selectedTransaction.amount
                        });
                        setSelectedTransaction(null);
                        setShowApprovalModal(true);
                      }}
                    >
                      {t("fund.modal.transactionDetail.approve")}
                    </button>
                    <button
                      className="btn-premium btn-outline"
                      style={{ flex: 1, color: '#e74c3c' }}
                      onClick={() => {
                        setApprovalData({
                          transaction_id: selectedTransaction.id,
                          status: 'rejected',
                          manager_note: '',
                          evidence_media_id: selectedTransaction.evidence_media_id,
                          person_name: selectedTransaction.person_name,
                          amount: selectedTransaction.amount
                        });
                        setSelectedTransaction(null);
                        setShowApprovalModal(true);
                      }}
                    >
                      {t("fund.modal.transactionDetail.reject")}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Pending Transactions Modal */}
      {showPendingModal && (
        <div className="fund-modal-v2" onClick={() => setShowPendingModal(false)}>
          <div className="modal-glass ledger-modal" style={{ maxWidth: '800px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header-v2">
              <div>
                <h3>{t("fund.modal.pending.title")}</h3>
                <p className="modal-subtitle">{t("fund.modal.pending.subtitle", { count: pendingTransactions.length })}</p>
              </div>
              <button onClick={() => setShowPendingModal(false)} className="close-btn">&times;</button>
            </div>
            <div className="modal-body-v2">
              <div className="ledger-table-wrapper" style={{ maxHeight: '60vh' }}>
                <table className="fund-table-v3">
                  <thead>
                    <tr>
                      <th>{t("fund.ledger.transaction")}</th>
                      <th>{t("fund.modal.transactionDetail.payer")}/{t("fund.modal.transactionDetail.recipient")}</th>
                      <th>{t("fund.ledger.amount")}</th>
                      <th>{t("fund.modal.form.action")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingTransactions.map(tx => (
                      <tr key={`${tx.type}-${tx.id}`}>
                        <td>
                          <div className="tx-name">{tx.note || (tx.type === 'income' ? t("fund.modal.pending.income") : t("fund.modal.pending.expense"))}</div>
                          <div className="tx-date">{formatDateVN(tx.date)}</div>
                        </td>
                        <td>{tx.person_name || '---'}</td>
                        <td className={`tx-val ${tx.type}`}>
                          {tx.type === 'income' ? '+' : '-'}{formatCurrency(tx.amount)}
                        </td>
                        <td>
                          <button
                            className="btn-approve-v3-active"
                            onClick={() => {
                              setApprovalData({
                                transaction_id: tx.id,
                                status: 'approved',
                                manager_note: '',
                                evidence_media_id: tx.evidence_media_id,
                                person_name: tx.person_name,
                                amount: tx.amount
                              });
                              setShowApprovalModal(true);
                            }}
                          >
                            {t("fund.modal.pending.approve")}
                          </button>
                        </td>
                      </tr>
                    ))}
                    {!pendingTransactions.length && (
                      <tr><td colSpan="4" className="table-empty">{t("fund.modal.pending.noPending")}</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      <style
        dangerouslySetInnerHTML={{
          __html: `
            .badge-count {
              position: absolute;
              top: -8px;
              right: -8px;
              background: #e74c3c;
              color: white;
              font-size: 0.7rem;
              font-weight: 900;
              width: 22px;
              height: 22px;
              border-radius: 50%;
              display: flex;
              align-items: center;
              justify-content: center;
              border: 2px solid #fff;
              box-shadow: 0 2px 4px rgba(0,0,0,0.2);
              z-index: 10;
            }

            .fund-container {
              padding: 0.65rem 1.15rem 1.25rem;
              max-width: 1480px;
              margin: 0 auto;
            }

            .premium-header {
              margin-top: -0.4rem;
              margin-bottom: 0.7rem;
              padding: 0.9rem 1.15rem;
              border-radius: 20px;
              min-height: unset;
              display: flex;
              align-items: center;
              justify-content: space-between;
              gap: 1rem;
              background:
                linear-gradient(135deg, rgba(52, 18, 16, 0.95), rgba(113, 38, 30, 0.9)),
                rgba(255, 248, 232, 0.06);
              border: 1px solid rgba(238, 194, 105, 0.16);
              box-shadow: 0 10px 26px rgba(45, 12, 8, 0.2);
            }

            .header-kicker {
              display: none;
            }

            .header-info h1 {
              margin: 0;
              font-size: clamp(1.35rem, 1.8vw, 1.9rem);
              line-height: 1.05;
              color: #fff8df;
              letter-spacing: -0.025em;
            }

            .header-info p {
              margin: 0.28rem 0 0;
              color: rgba(255, 242, 205, 0.68);
              font-weight: 600;
              font-size: 0.86rem;
            }

            .header-actions {
              display: flex;
              gap: 0.5rem;
              flex-wrap: wrap;
              justify-content: flex-end;
              align-items: center;
            }

            .btn-premium {
              min-height: 38px;
              border-radius: 12px;
              padding: 0 0.78rem;
              font-size: 0.85rem;
              font-weight: 900;
              display: inline-flex;
              align-items: center;
              justify-content: center;
              gap: 0.32rem;
              border: 0;
              cursor: pointer;
              transition: transform 0.18s ease, box-shadow 0.18s ease, filter 0.18s ease;
              white-space: nowrap;
            }

            .btn-premium .material-symbols-outlined {
              font-size: 1.12rem;
            }

            .btn-premium:hover {
              transform: translateY(-2px);
              filter: brightness(1.03);
            }

            .btn-outline {
              background: rgba(255, 250, 240, 0.95);
              color: #5b281b;
              border: 1px solid rgba(212, 164, 65, 0.36);
            }

            .btn-gold {
              background: linear-gradient(135deg, #d9a323, #b77912);
              color: #fff8df;
              box-shadow: 0 12px 24px rgba(196, 132, 18, 0.28);
            }

            .btn-green {
              background: linear-gradient(135deg, #2f8f42, #1f6d32);
              color: #fff;
              box-shadow: 0 12px 24px rgba(34, 121, 54, 0.22);
            }

            .fund-quick-stats {
              display: grid;
              grid-template-columns: repeat(4, minmax(0, 1fr));
              gap: 0.7rem;
              margin: 0 0 0.8rem;
            }

            .quick-stat-card {
              display: flex;
              align-items: center;
              gap: 0.65rem;
              padding: 0.68rem 0.78rem;
              border-radius: 16px;
              background: rgba(255, 248, 234, 0.92);
              border: 1px solid rgba(217, 163, 35, 0.24);
              box-shadow: 0 8px 20px rgba(50, 19, 14, 0.1);
              backdrop-filter: blur(10px);
              min-width: 0;
            }

            .quick-stat-icon {
              width: 36px;
              height: 36px;
              border-radius: 13px;
              display: grid;
              place-items: center;
              background: rgba(142, 36, 27, 0.1);
              color: #8e241b;
              flex-shrink: 0;
            }

            .quick-stat-icon .material-symbols-outlined {
              font-size: 1.28rem;
            }

            .quick-stat-card p {
              margin: 0 0 0.15rem;
              color: #7a5a46;
              font-weight: 800;
              font-size: 0.76rem;
              line-height: 1.1;
            }

            .quick-stat-card strong {
              display: block;
              color: #4a1e13;
              font-size: clamp(0.92rem, 1.2vw, 1.12rem);
              line-height: 1.1;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
            }

            .balance-card {
              background: linear-gradient(135deg, rgba(255, 248, 234, 0.96), rgba(255, 237, 185, 0.9));
            }

            .income-card .quick-stat-icon {
              background: rgba(38, 130, 58, 0.12);
              color: #267d3c;
            }

            .expense-card .quick-stat-icon {
              background: rgba(176, 49, 37, 0.12);
              color: #a42d22;
            }

            .campaign-mini-card .quick-stat-icon {
              background: rgba(201, 154, 50, 0.15);
              color: #a36c09;
            }

            .fund-analytics-compact {
              margin: 0 0 0.85rem;
            }

            .fund-analytics-compact > * {
              margin-top: 0 !important;
            }

            .fund-analytics-compact .glass-card,
            .fund-analytics-compact [class*="glass"],
            .fund-analytics-compact [class*="analytics"],
            .fund-analytics-compact [class*="chart"] {
              border-radius: 18px !important;
            }

            .fund-main-grid {
              margin-top: 0.75rem;
              display: grid;
              grid-template-columns: minmax(0, 1fr) minmax(360px, 0.82fr);
              gap: 0.95rem;
              align-items: start;
              padding-bottom: 2rem;
            }

            .fund-main-grid section {
              min-width: 0;
            }

            .section-title {
              margin: 0 0 0.6rem;
              color: #fff6d8;
              font-size: 1.22rem;
              letter-spacing: -0.02em;
              display: flex;
              align-items: center;
              gap: 0.45rem;
            }

            .section-title::before {
              content: "";
              width: 5px;
              height: 21px;
              border-radius: 999px;
              background: linear-gradient(180deg, #d9a323, #fff1b8);
              box-shadow: 0 0 16px rgba(217, 163, 35, 0.45);
            }

            .campaign-grid-v3 {
              display: grid;
              grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
              gap: 0.85rem;
              align-items: stretch;
              padding-bottom: 1.2rem;
            }

            .campaign-grid-v3.vertical-scroll {
              display: grid;
              grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
              max-height: 520px;
              overflow-y: auto;
              padding: 0.5rem 0.5rem 1rem;
              gap: 1rem;
              scrollbar-width: thin;
              scrollbar-color: rgba(217, 163, 35, 0.3) transparent;
            }

            .campaign-grid-v3.vertical-scroll::-webkit-scrollbar {
              width: 6px;
            }

            .campaign-grid-v3.vertical-scroll::-webkit-scrollbar-thumb {
              background: rgba(217, 163, 35, 0.3);
              border-radius: 10px;
            }

            .campaign-grid-v3.vertical-scroll .campaign-card-v3 {
              flex: unset;
              min-width: unset;
            }

            .section-header-v3 {
              display: flex;
              justify-content: space-between;
              align-items: center;
              margin-bottom: 1rem;
              flex-wrap: wrap;
              gap: 1rem;
            }

            .fund-filters {
              display: flex;
              gap: 0.75rem;
              align-items: center;
            }

            .filter-item {
              display: flex;
              align-items: center;
              gap: 0.5rem;
              background: rgba(255, 248, 234, 0.6);
              border: 1px solid rgba(217, 163, 35, 0.2);
              padding: 0.35rem 0.75rem;
              border-radius: 12px;
              backdrop-filter: blur(5px);
            }

            .filter-item .material-symbols-outlined {
              font-size: 1.1rem;
              color: #a36c09;
            }

            .filter-item select {
              background: transparent;
              border: 0;
              color: #4a1e13;
              font-weight: 800;
              font-size: 0.85rem;
              outline: none;
              cursor: pointer;
              padding-right: 0.5rem;
            }

            .campaign-card-v3 {
              position: relative;
              padding: 0.9rem;
              min-height: 168px;
              border-radius: 18px;
              background: rgba(255, 248, 234, 0.92);
              border: 1px solid rgba(217, 163, 35, 0.25);
              box-shadow: 0 10px 24px rgba(48, 18, 12, 0.12);
              cursor: pointer;
              transition: transform 0.18s ease, box-shadow 0.18s ease;
              overflow: hidden;
              display: flex;
              flex-direction: column;
            }

            .campaign-card-v3:hover {
              transform: translateY(-3px);
              box-shadow: 0 16px 34px rgba(48, 18, 12, 0.18);
            }

            .campaign-card-v3::after {
              content: "";
              position: absolute;
              right: -28px;
              top: -28px;
              width: 92px;
              height: 92px;
              border-radius: 50%;
              background: rgba(217, 163, 35, 0.11);
              pointer-events: none;
            }

            .card-top {
              display: flex;
              justify-content: space-between;
              align-items: center;
              margin-bottom: 0.62rem;
              position: relative;
              z-index: 1;
            }

            .year-pill {
              padding: 0.25rem 0.55rem;
              border-radius: 999px;
              background: rgba(142, 36, 27, 0.1);
              color: #8e241b;
              font-weight: 900;
              font-size: 0.75rem;
            }

            .status-dot {
              width: 12px;
              height: 12px;
              border-radius: 50%;
              background: #aaa;
              box-shadow: 0 0 0 5px rgba(120, 120, 120, 0.12);
              position: relative;
              z-index: 1;
            }

            .status-dot.open {
              background: #2f8f42;
              box-shadow: 0 0 0 5px rgba(47, 143, 66, 0.15);
            }

            .status-dot.closed {
              background: #9b2f25;
              box-shadow: 0 0 0 5px rgba(155, 47, 37, 0.15);
            }

            .campaign-card-v3 h4 {
              margin: 0 0 0.7rem;
              color: #4a1e13;
              font-size: 0.98rem;
              line-height: 1.3;
              min-height: 2.2em;
              position: relative;
              z-index: 1;
            }

            .progress-container-v3 {
              height: 8px;
              border-radius: 999px;
              background: rgba(90, 53, 31, 0.12);
              overflow: hidden;
              margin-bottom: 0.6rem;
              position: relative;
              z-index: 1;
            }

            .progress-bar-v3 {
              height: 100%;
              border-radius: inherit;
              background: linear-gradient(90deg, #2f8f42, #88c057);
            }

            .campaign-card-footer {
              margin-top: auto;
              position: relative;
              z-index: 2;
              display: flex;
              flex-direction: column;
              align-items: stretch;
              gap: 0.32rem;
              width: 100%;
            }

            .card-bottom {
              display: flex;
              align-items: baseline;
              justify-content: space-between;
              gap: 0.25rem;
              flex-wrap: nowrap;
              color: #4a1e13;
              font-weight: 900;
              font-size: 0.9rem;
              width: 100%;
              margin: 0;
              line-height: 1.2;
            }

            .card-bottom > span:first-child {
              min-width: 0;
              overflow: hidden;
              text-overflow: ellipsis;
              white-space: nowrap;
            }

            .target-text {
              color: #8c725d;
              font-size: 0.8rem;
              font-weight: 700;
              white-space: nowrap;
              flex-shrink: 0;
            }

            .campaign-card-v3 .completion-rate {
              display: block !important;
              width: 100% !important;
              position: static !important;
              left: auto !important;
              right: auto !important;
              top: auto !important;
              bottom: auto !important;
              transform: none !important;
              align-self: stretch !important;
              margin: 0 !important;
              padding: 0 !important;
              color: #8e241b !important;
              font-weight: 900 !important;
              font-size: 0.8rem !important;
              line-height: 1.2 !important;
              text-align: left !important;
              white-space: nowrap !important;
              overflow: hidden !important;
              text-overflow: ellipsis !important;
              clear: both !important;
            }

            .ledger-box {
              min-height: 100%;
              padding: 0;
              overflow: hidden;
              border-radius: 18px;
              background: rgba(255, 248, 234, 0.92);
              border: 1px solid rgba(217, 163, 35, 0.25);
              box-shadow: 0 10px 24px rgba(48, 18, 12, 0.12);
            }

            .fund-table-v3 {
              width: 100%;
              border-collapse: collapse;
            }

            .fund-table-v3 thead {
              background: rgba(91, 40, 27, 0.07);
            }

            .fund-table-v3 th {
              padding: 0.72rem 0.8rem;
              color: #5d4638;
              text-align: left;
              font-size: 0.75rem;
              text-transform: uppercase;
              letter-spacing: 0.04em;
            }

            .fund-table-v3 td {
              padding: 0.72rem 0.8rem;
              border-top: 1px solid rgba(92, 54, 35, 0.08);
              color: #4a1e13;
              vertical-align: middle;
            }

            .fund-table-v3 td strong {
              color: #4a1e13;
            }

            .tx-name {
              font-weight: 900;
              color: #4a1e13;
              max-width: 210px;
              overflow: hidden;
              text-overflow: ellipsis;
              white-space: nowrap;
              font-size: 0.9rem;
            }

            .tx-date {
              margin-top: 0.25rem;
              color: #8a7462;
              font-size: 0.78rem;
              display: flex;
              align-items: center;
              gap: 0.35rem;
              flex-wrap: wrap;
            }

            .tx-person-pill {
              display: inline-flex;
              align-items: center;
              padding: 0.16rem 0.5rem;
              border-radius: 999px;
              background: rgba(142, 36, 27, 0.08);
              color: #8e241b;
              font-weight: 800;
            }

            .tx-val {
              font-weight: 1000;
              white-space: nowrap;
            }

            .tx-val.income {
              color: #267d3c;
            }

            .tx-val.expense {
              color: #b33428;
            }

            .method-pill {
              display: inline-flex;
              padding: 0.25rem 0.5rem;
              border-radius: 999px;
              background: rgba(217, 163, 35, 0.14);
              color: #76501b;
              font-weight: 900;
              font-size: 0.75rem;
              white-space: nowrap;
            }

            .table-empty,
            .empty-state-card {
              padding: 1.2rem;
              text-align: center;
              color: #80614c;
              font-weight: 800;
              background: rgba(255, 248, 234, 0.88);
              border: 1px dashed rgba(217, 163, 35, 0.35);
              border-radius: 18px;
            }

            .approval-info {
              margin-bottom: 1.25rem;
              padding: 1rem;
              border-radius: 18px;
            }

            .info-row {
              display: flex;
              justify-content: space-between;
              gap: 1rem;
              margin-bottom: 0.6rem;
              color: #5d4638;
            }

            .info-row:last-child {
              margin-bottom: 0;
            }

            .ledger-table-wrapper {
              max-height: 420px;
              overflow-y: auto;
              padding-right: 0.25rem;
            }

            .bill-img-v3 {
              display: block;
              margin: 0 auto;
              max-width: 100%;
              border-radius: 18px;
            }

            .fund-modal-v2 {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding: 24px 14px 64px;
  overflow-y: auto;
  background: rgba(22, 8, 14, 0.62);
  backdrop-filter: blur(5px);
}

            .modal-glass {
              background:
                linear-gradient(135deg, rgba(255, 248, 234, 0.96), rgba(246, 232, 203, 0.94));
              border: 1px solid rgba(217, 163, 35, 0.28);
              box-shadow: 0 26px 70px rgba(33, 10, 8, 0.32);
              border-radius: 28px;
            }

            .fund-create-modal {
  width: min(94vw, 920px);
  max-height: none;
  overflow: visible;
  display: block;
  margin-bottom: 56px;
}

.ledger-modal {
  width: min(94vw, 980px);
  max-height: calc(100vh - 48px);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

            .approval-modal {
              width: min(94vw, 520px);
              max-height: calc(100vh - 48px);
              overflow: hidden;
              display: flex;
              flex-direction: column;
            }

            .cash-expense-modal {
              width: min(94vw, 720px);
              max-height: calc(100vh - 48px);
              overflow: hidden;
              display: flex;
              flex-direction: column;
              border-radius: 28px;
            }

            .modal-body-v2 {
              overflow-y: auto;
              padding: 20px 22px 24px;
            }

            .cash-expense-modal .modal-body-v2,
.ledger-modal .modal-body-v2,
.approval-modal .modal-body-v2 {
  max-height: calc(100vh - 145px);
}

.fund-create-modal .modal-body-v2 {
  max-height: none;
  overflow: visible;
  padding: 20px 26px 34px;
}

.fund-create-modal .premium-form {
  padding-bottom: 20px;
}

.fund-create-modal .modal-footer {
  position: sticky;
  bottom: 0;
  z-index: 10;
  margin-top: 18px;
  padding: 14px 0 0;
  background: linear-gradient(
    180deg,
    rgba(246, 232, 203, 0),
    rgba(246, 232, 203, 0.98) 35%,
    rgba(246, 232, 203, 1)
  );
}

            .modal-header-v2 {
              flex-shrink: 0;
              padding: 22px 26px 18px;
              border-bottom: 1px solid rgba(92, 54, 35, 0.12);
              display: flex;
              justify-content: space-between;
              align-items: flex-start;
              gap: 1rem;
            }

            .modal-header-v2 h3 {
              margin: 0;
              color: #4a1e13;
              font-size: 1.6rem;
              letter-spacing: -0.02em;
            }

            .modal-subtitle {
              margin: 6px 0 0;
              color: #8a674f;
              font-weight: 700;
              line-height: 1.4;
            }

            .close-btn {
              width: 40px;
              height: 40px;
              border-radius: 14px;
              border: 0;
              background: rgba(142, 36, 27, 0.1);
              color: #8e241b;
              font-size: 1.65rem;
              cursor: pointer;
              line-height: 1;
              flex-shrink: 0;
            }

            .premium-form {
              padding-bottom: 10px;
            }

            .form-row-2 {
              display: grid;
              grid-template-columns: repeat(2, minmax(0, 1fr));
              gap: 1rem;
            }

            .form-group {
              margin-bottom: 1rem;
            }

            .form-group label {
              display: block;
              margin-bottom: 0.55rem;
              color: #4f6178;
              font-weight: 900;
            }

            .premium-form input,
            .premium-form select,
            .premium-form textarea,
            .mgmt-toolbar input,
            .mgmt-toolbar select {
              width: 100%;
              max-width: 100%;
              min-height: 54px;
              box-sizing: border-box;
              border-radius: 14px;
              border: 1px solid rgba(117, 82, 57, 0.17);
              background: rgba(255, 255, 255, 0.72);
              padding: 0.85rem 1rem;
              color: #552718;
              font-size: 1rem;
              outline: none;
              transition: border 0.16s ease, box-shadow 0.16s ease, background 0.16s ease;
            }

            .premium-form textarea {
              min-height: 92px;
              resize: vertical;
              line-height: 1.45;
            }

            .premium-form input:focus,
            .premium-form select:focus,
            .premium-form textarea:focus,
            .mgmt-toolbar input:focus,
            .mgmt-toolbar select:focus {
              border-color: rgba(217, 163, 35, 0.9);
              box-shadow: 0 0 0 4px rgba(217, 163, 35, 0.14);
              background: rgba(255, 255, 255, 0.94);
            }

            .sub-title-v3 {
              margin: 1.15rem 0 1rem;
              color: #4a1e13;
              font-size: 1.1rem;
            }

            .upload-label-v3 {
              min-height: 54px;
              border-radius: 14px;
              display: flex;
              align-items: center;
              justify-content: center;
              gap: 0.5rem;
              background: rgba(255, 255, 255, 0.72);
              border: 1px dashed rgba(117, 82, 57, 0.3);
              color: #8e241b;
              font-weight: 900;
              cursor: pointer;
            }

            .modal-footer {
              display: flex;
              justify-content: flex-end;
              gap: 0.8rem;
              margin-top: 1rem;
            }

            .expense-summary-card {
              display: flex;
              gap: 14px;
              align-items: center;
              padding: 16px;
              border-radius: 20px;
              background: linear-gradient(135deg, rgba(142, 36, 27, .08), rgba(201, 154, 50, .13));
              border: 1px solid rgba(201, 154, 50, .3);
              margin-bottom: 18px;
            }

            .expense-summary-card .material-symbols-outlined {
              color: #8e241b;
              font-size: 2rem;
              flex-shrink: 0;
            }

            .expense-summary-card strong {
              color: #4a1e13;
              font-size: 1.08rem;
            }

            .expense-summary-card p {
              margin: 4px 0 0;
              color: #8a674f;
              line-height: 1.35;
            }

            .recipient-panel {
              padding: 16px;
              border-radius: 22px;
              background: rgba(255, 250, 240, .76);
              border: 1px dashed rgba(201, 154, 50, .58);
              margin-bottom: 16px;
              overflow: hidden;
            }

            .recipient-panel-head {
              display: flex;
              justify-content: space-between;
              align-items: flex-start;
              gap: 14px;
              margin-bottom: 14px;
            }

            .recipient-panel-head > div {
              min-width: 0;
            }

            .recipient-panel-head strong {
              color: #4a1e13;
              font-size: 1.05rem;
            }

            .recipient-panel-head span:not(.material-symbols-outlined) {
              display: block;
              margin-top: 4px;
              color: #8a674f;
              font-size: .92rem;
              line-height: 1.35;
            }

            .quick-manager-btn {
              display: inline-flex;
              align-items: center;
              justify-content: center;
              gap: 8px;
              border: 1px solid rgba(142, 36, 27, .24);
              background: #fff8ea;
              color: #8e241b;
              border-radius: 16px;
              padding: 11px 15px;
              font-weight: 900;
              cursor: pointer;
              white-space: nowrap;
              max-width: 100%;
            }

            .quick-manager-btn.active {
              background: linear-gradient(135deg, #8e241b, #b84631);
              color: #fff8ea;
            }

            .member-help-text {
              margin-top: 8px;
              color: #8e241b;
              font-size: 0.88rem;
              font-weight: 800;
              line-height: 1.4;
            }

            .cash-expense-modal select:disabled {
              cursor: not-allowed;
              opacity: 0.75;
              background: rgba(245, 239, 226, 0.85);
            }

            .submit-wide {
              width: 100%;
              margin-top: 1rem;
              min-height: 54px;
              border-radius: 16px;
            }

            .mgmt-toolbar {
              display: grid;
              grid-template-columns: repeat(3, minmax(0, 1fr));
              gap: 1rem;
              padding: 1rem;
              margin-bottom: 1rem;
              border-radius: 20px;
              background: rgba(255, 250, 240, 0.7);
            }

            .mgmt-item label {
              display: block;
              margin-bottom: 0.5rem;
              color: #4f6178;
              font-weight: 900;
            }

            .input-with-btn {
              display: flex;
              align-items: center;
              gap: 0.5rem;
            }

            .input-with-btn span {
              color: #76501b;
              font-weight: 800;
              white-space: nowrap;
            }

            .mini-qr img {
              width: 58px;
              height: 58px;
              object-fit: cover;
              border-radius: 12px;
              cursor: pointer;
              border: 1px solid rgba(217, 163, 35, 0.35);
            }

            .ledger-stats-v3 {
              display: grid;
              grid-template-columns: repeat(3, minmax(0, 1fr));
              gap: 1rem;
              margin-bottom: 1rem;
            }

            .l-stat {
              padding: 1rem;
              border-radius: 18px;
              background: rgba(255, 248, 234, 0.82);
              border: 1px solid rgba(217, 163, 35, 0.22);
            }

            .l-stat span {
              display: block;
              color: #7a5a46;
              font-weight: 800;
              margin-bottom: 0.35rem;
            }

            .l-stat strong {
              color: #4a1e13;
              font-size: 1.25rem;
            }

            .header-actions-v2 {
              display: flex;
              align-items: center;
              gap: 0.75rem;
            }

            .btn-export-v2,
            .btn-approve-v3-active {
              border: 0;
              border-radius: 14px;
              padding: 0.75rem 1rem;
              font-weight: 900;
              cursor: pointer;
              background: linear-gradient(135deg, #d9a323, #b77912);
              color: #fff8df;
            }

            .done-pill {
              display: inline-flex;
              padding: 0.35rem 0.65rem;
              border-radius: 999px;
              background: rgba(47, 143, 66, 0.12);
              color: #267d3c;
              font-weight: 900;
            }

            .glass-bg {
              min-height: 100vh;
              overflow: visible;
            }

            @media (max-width: 1180px) {
              .premium-header {
                flex-direction: column;
                align-items: stretch;
              }

              .header-actions {
                justify-content: flex-start;
              }

              .fund-quick-stats {
                grid-template-columns: repeat(2, minmax(0, 1fr));
              }

              .fund-main-grid {
                grid-template-columns: 1fr;
              }

              .mgmt-toolbar {
                grid-template-columns: 1fr;
              }
            }

            @media (max-width: 720px) {
              .fund-container {
                padding: 0.65rem;
              }

              .premium-header {
                padding: 0.85rem;
                border-radius: 16px;
              }

              .header-info h1 {
                font-size: 1.28rem;
              }

              .header-info p {
                font-size: 0.8rem;
              }

              .header-actions {
                display: grid;
                grid-template-columns: 1fr;
              }

              .btn-premium {
                width: 100%;
              }

              .fund-quick-stats {
                grid-template-columns: 1fr;
                gap: 0.5rem;
              }

              .campaign-grid-v3 {
                grid-template-columns: 1fr;
              }

              .fund-table-v3 {
                font-size: 0.9rem;
              }

              .fund-table-v3 th,
              .fund-table-v3 td {
                padding: 0.8rem;
              }

              .tx-name {
                max-width: 150px;
              }

              .fund-modal-v2 {
                padding: 12px;
              }

              .cash-expense-modal,
.fund-create-modal,
.ledger-modal,
.approval-modal {
  width: 100%;
  max-height: calc(100vh - 24px);
  border-radius: 20px;
}

.fund-create-modal {
  max-height: none;
  overflow: visible;
  display: block;
  margin-bottom: 44px;
}

.fund-create-modal .modal-body-v2 {
  max-height: none;
  overflow: visible;
  padding: 16px 16px 28px;
}

.fund-create-modal .modal-footer {
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;
}

.fund-create-modal .modal-footer .btn-premium {
  width: 100%;
}

              .modal-header-v2 {
                padding: 18px 18px 14px;
              }

              .modal-body-v2 {
                padding: 16px;
                max-height: calc(100vh - 125px);
              }

              .form-row-2 {
                grid-template-columns: 1fr !important;
              }

              .recipient-panel-head {
                flex-direction: column;
              }

              .quick-manager-btn {
                width: 100%;
                white-space: normal;
              }

              .ledger-stats-v3 {
                grid-template-columns: 1fr;
              }

              .header-actions-v2 {
                flex-direction: column;
                align-items: stretch;
              }

              .btn-export-v2 {
                width: 100%;
              }

              .modal-footer {
                flex-direction: column;
              }
            }
          `
        }}
      />
    </div>
  );
}

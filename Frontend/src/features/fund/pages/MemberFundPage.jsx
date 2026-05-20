import { useEffect, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { apiRequest } from "../../../services/api";
import { resolveImageUrl } from "../../../shared/utils/media";
import { formatDateVN } from "../../../shared/utils/dateFormat";
import "./FundDesign.css";

export default function MemberFundPage() {
  const { t } = useTranslation();
  const [campaigns, setCampaigns] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [selectedCampaign, setSelectedCampaign] = useState(null);
  const [loading, setLoading] = useState(true);
  const totalIncome = transactions.filter(tx => tx.type === 'income' && tx.status === 'approved').reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
  const totalExpense = transactions.filter(tx => tx.type === 'expense' && tx.status === 'approved').reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
  const currentBalance = totalIncome - totalExpense;

  // Filter main ledger for members
  const pendingTransactions = transactions.filter(tx => tx.status === 'pending');
  
  const mainLedgerTransactions = transactions.filter(tx => {
    if (tx.status !== 'approved') return false;
    if (tx.type === 'expense') return true;
    const isCampaignIncome = !!tx.campaign_name;
    const isVoluntaryIncome = tx.note && tx.note.toLowerCase().includes('đóng góp tự nguyện');
    return !isCampaignIncome && !isVoluntaryIncome;
  });
  const [showPayModal, setShowPayModal] = useState(false);
  const [showGeneralForm, setShowGeneralForm] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState(null);

  const [formData, setFormData] = useState({ amount: "", note: "", method: "Chuyển khoản", evidence_media_id: null });
  const [generalData, setGeneralData] = useState({ amount: "", note: "", method: "Tiền mặt" });

  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");

  const paymentMethods = {
    transfer: "Chuyển khoản",
    cash: "Tiền mặt",
  };

  const getMethodLabel = (method) => {
    if (method === paymentMethods.transfer) return t("fund.methods.transfer");
    if (method === paymentMethods.cash) return t("fund.methods.cash");
    return method || t("fund.methods.cash");
  };

  const getContributionUnitLabel = (unit) =>
    unit === "males_only"
      ? t("fund.member.contributionUnits.malesOnly")
      : t("fund.member.contributionUnits.adultsAll");

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const campData = await apiRequest("/api/member/fund/campaigns");
      setCampaigns(campData.campaigns);
      const txData = await apiRequest("/api/member/fund/transactions");
      setTransactions(txData.transactions);
    } catch (error) {
      console.error("Error loading member fund data:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const openPayModal = async (campaign) => {
    try {
      const details = await apiRequest(`/api/member/fund/campaigns/${campaign.id}`);
      setSelectedCampaign(details);
      setFormData({
        amount: details.campaign.amount_per_member,
        note: `${t("fund.member.form.contributionNote")} ${details.campaign.name}`,
        method: paymentMethods.transfer,
        evidence_media_id: null
      });
      setShowPayModal(true);
    } catch (error) {
      alert(t("fund.member.messages.loadCampaignDetailError"));
    }
  };

  const handleUploadBill = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const uploadFormData = new FormData();
    uploadFormData.append("image", file);
    uploadFormData.append("usage_type", "other");

    try {
      const res = await apiRequest("/api/upload", {
        method: "POST",
        body: uploadFormData,
        headers: {}
      });
      setFormData(prev => ({ ...prev, evidence_media_id: res.mediaId }));
    } catch (error) {
      alert(t("fund.member.messages.uploadBillError"));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await apiRequest("/api/member/fund/report-payment", {
        method: "POST",
        body: JSON.stringify({
          ...formData,
          campaign_id: selectedCampaign.campaign.id
        })
      });
      setSuccessMsg(t("fund.member.messages.reportSuccess"));
      setTimeout(() => {
        setShowPayModal(false);
        setSuccessMsg("");
        loadData();
      }, 2500);
    } catch (error) {
      alert(error.message || t("fund.member.messages.reportError"));
    } finally {
      setSubmitting(false);
    }
  };

  const handleGeneralSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await apiRequest("/api/member/fund/income", {
        method: "POST",
        body: JSON.stringify({
          ...generalData,
          date: new Date().toISOString().split('T')[0]
        })
      });
      setSuccessMsg(t("fund.member.messages.generalSuccess"));
      setTimeout(() => {
        setShowGeneralForm(false);
        setSuccessMsg("");
        loadData();
      }, 2500);
    } catch (error) {
      alert(error.message || t("fund.member.messages.reportError"));
    } finally {
      setSubmitting(false);
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
  };

  return (
    <div className="fund-container glass-bg">
      {/* Hero Header */}
      <header className="glass-card mb-4" style={{ textAlign: 'center', background: 'rgba(17, 20, 32, 0.6)' }}>
        <h1 style={{ color: '#fff', fontSize: '2.5rem', marginBottom: '0.5rem' }}>{t("fund.member.hero.title")}</h1>
        <p style={{ fontSize: '1.1rem', color: 'rgba(255,255,255,0.6)', maxWidth: '600px', margin: '0 auto 1.5rem' }}>
          {t("fund.member.hero.subtitle")}
        </p>
        <button className="btn-premium btn-gold" onClick={() => setShowGeneralForm(true)}>
          <span className="material-symbols-outlined">volunteer_activism</span> {t("fund.member.actions.voluntaryContribution")}
        </button>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 400px', gap: '2rem', marginTop: '3rem' }}>
        {/* Active Campaigns */}
        <section>
          <h2 className="section-title">{t("fund.member.sections.obligations")}</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.5rem' }}>
            {campaigns.filter(c => c.status === 'open').map(c => (
              <div key={c.id} className="glass-card campaign-member-v2">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <span className="year-pill">{c.year}</span>
                  <span className="deadline-tag" style={{ fontSize: '0.8rem', color: '#ff7675', fontWeight: 'bold' }}>
                    {t("fund.member.labels.deadline")}: {formatDateVN(c.deadline)}
                  </span>
                </div>
                <h4 style={{ fontSize: '1.3rem', marginBottom: '1rem', color: 'var(--fund-text)' }}>{c.name}</h4>
                <div className="card-info-box">
                  <div className="info-row">
                    <label>{t("fund.member.labels.amountPerUnit")}</label>
                    <strong style={{ color: 'var(--fund-text)' }}>{formatCurrency(c.amount_per_member)}</strong>
                  </div>
                  <div className="info-row">
                    <label>{t("fund.member.labels.target")}</label>
                    <span style={{ color: 'var(--fund-text)' }}>{getContributionUnitLabel(c.contribution_unit_definition)}</span>
                  </div>
                  <div className="info-row" style={{ marginTop: '8px', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '8px' }}>
                    <label style={{ color: '#ff7675' }}>{t("fund.campaigns.spent")}</label>
                    <strong style={{ color: '#ff7675' }}>{formatCurrency(c.spent_amount)}</strong>
                  </div>
                  <div className="info-row">
                    <label style={{ color: '#2ecc71' }}>{t("fund.campaigns.balance")}</label>
                    <strong style={{ color: '#2ecc71' }}>{formatCurrency(c.balance)}</strong>
                  </div>
                </div>
                <button className="btn-premium btn-green" style={{ width: '100%', marginTop: '1.5rem' }} onClick={() => openPayModal(c)}>
                  {t("fund.member.actions.payNow")}
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* Global Ledger (Transparency) */}
        <section>
          <h2 className="section-title">{t("fund.member.sections.transparency")}</h2>
          <div className="glass-card ledger-box" style={{ padding: '1rem', background: 'rgba(17, 20, 32, 0.6)' }}>
            <div className="tx-scroller" style={{ maxHeight: '600px', overflowY: 'auto' }}>
              {mainLedgerTransactions.map(tx => (
                <div key={`${tx.type}-${tx.id}`} className={`tx-card-v2 ${tx.type}`} onClick={() => setSelectedTransaction(tx)} style={{ cursor: 'pointer' }}>
                  <div className="tx-main">
                    <div className="tx-note">{tx.note || t("fund.member.ledger.defaultNote")}</div>
                    <div className="tx-meta">
                      {formatDateVN(tx.date)}
                      <span style={{marginLeft: '8px', padding: '2px 6px', borderRadius: '4px', background: 'rgba(255,255,255,0.1)', fontSize: '0.7rem'}}>
                        {tx.campaign_name || t("fund.ledger.generalFund")}
                      </span>
                      <span style={{
                        marginLeft: '8px', 
                        padding: '2px 6px', 
                        borderRadius: '4px', 
                        background: tx.method === paymentMethods.transfer ? 'rgba(52, 152, 219, 0.2)' : 'rgba(46, 204, 113, 0.2)', 
                        color: tx.method === paymentMethods.transfer ? '#3498db' : '#2ecc71', 
                        fontSize: '0.7rem'
                      }}>
                        {getMethodLabel(tx.method)}
                      </span>
                    </div>
                  </div>
                  <div className="tx-amount" style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 'bold', color: tx.type === 'income' ? '#2ecc71' : '#ff7675' }}>
                      {tx.type === 'income' ? '+' : '-'}{formatCurrency(tx.amount)}
                    </div>
                    {tx.status === 'pending' && <span className="pending-label">{t("fund.member.ledger.pending")}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>

      {/* Payment Modal */}
      {showPayModal && selectedCampaign && (
        <div className="fund-modal-v2" onClick={() => setShowPayModal(false)}>
          <div className="modal-glass" style={{ maxWidth: '850px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header-v2">
              <h3>{t("fund.member.modal.payTitle")}</h3>
              <button onClick={() => setShowPayModal(false)} className="close-btn">&times;</button>
            </div>
            <div className="modal-body-v2">
              {successMsg ? (
                <div className="success-screen">
                  <span className="material-symbols-outlined">check_circle</span>
                  <h3>{t("fund.member.messages.thankYou")}</h3>
                  <p>{successMsg}</p>
                </div>
              ) : (
                <div className="pay-container-v3">
                  {/* Method Switcher */}
                  <div className="method-switcher-v3">
                    <label className={formData.method === paymentMethods.transfer ? 'active' : ''}>
                      <input type="radio" value={paymentMethods.transfer} checked={formData.method === paymentMethods.transfer} onChange={e => setFormData({ ...formData, method: e.target.value })} />
                      <span className="material-symbols-outlined">account_balance</span> {t("fund.methods.transfer")}
                    </label>
                    <label className={formData.method === paymentMethods.cash ? 'active' : ''}>
                      <input type="radio" value={paymentMethods.cash} checked={formData.method === paymentMethods.cash} onChange={e => setFormData({ ...formData, method: e.target.value })} />
                      <span className="material-symbols-outlined">payments</span> {t("fund.methods.cash")}
                    </label>
                  </div>

                  <div className="pay-layout-v3">
                    {formData.method === paymentMethods.transfer ? (
                      <div className="bank-details-v3">
                        <div className="bank-card-v3">
                          <div className="bank-row"><label>{t("fund.member.bank.bankName")}:</label> <span>{selectedCampaign.campaign.bank_name}</span></div>
                          <div className="bank-row"><label>{t("fund.member.bank.bankAccount")}:</label> <strong>{selectedCampaign.campaign.bank_account}</strong></div>
                          <div className="bank-row"><label>{t("fund.member.bank.bankOwner")}:</label> <span>{selectedCampaign.campaign.bank_owner}</span></div>
                          <div className="bank-row total-row">
                            <label>{t("fund.modal.form.amount")}:</label> <strong>{formatCurrency(selectedCampaign.campaign.amount_per_member)}</strong>
                          </div>
                        </div>
                        {selectedCampaign.campaign.qr_code_media_id && (
                          <div className="qr-box-v3">
                            <img src={resolveImageUrl({ mediaId: selectedCampaign.campaign.qr_code_media_id })} alt="QR Code" />
                            <p>{t("fund.member.bank.qrHelp")}</p>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="cash-info-v3">
                        <div className="cash-card-v3">
                          <span className="material-symbols-outlined large-icon">info</span>
                          <h4>{t("fund.member.cash.title")}</h4>
                          <p>{t("fund.member.cash.desc1")}</p>
                          <p>{t("fund.member.cash.desc2")}</p>
                        </div>
                      </div>
                    )}

                    <form onSubmit={handleSubmit} className="premium-form">
                      <h4>{t("fund.member.form.reportTitle")}</h4>
                      <div className="form-group"><label>{t("fund.member.form.contributionAmount")}</label><input type="number" required value={formData.amount} onChange={e => setFormData({ ...formData, amount: e.target.value })} /></div>

                      {formData.method === paymentMethods.transfer && (
                        <div className="form-group">
                          <label>{t("fund.member.form.billImage")}</label>
                          <div className="upload-box-v2">
                            <input type="file" onChange={handleUploadBill} id="bill-upload" hidden />
                            <label htmlFor="bill-upload" className="upload-label-v3">
                              <span className="material-symbols-outlined">image</span>
                              {formData.evidence_media_id ? t("fund.member.form.billAttached") : t("fund.member.form.uploadBill")}
                            </label>
                          </div>
                        </div>
                      )}

                      <div className="form-group"><label>{t("fund.modal.approval.note")}</label><textarea value={formData.note} onChange={e => setFormData({ ...formData, note: e.target.value })} placeholder={t("fund.member.form.notePlaceholder")}></textarea></div>

                      <button type="submit" className="btn-premium btn-green" style={{ width: '100%', marginTop: '1rem' }} disabled={submitting || (formData.method === paymentMethods.transfer && !formData.evidence_media_id)}>
                        {t("fund.member.actions.sendReport")}
                      </button>
                    </form>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* General Modal */}
      {showGeneralForm && (
        <div className="fund-modal-v2" onClick={() => setShowGeneralForm(false)}>
          <div className="modal-glass" style={{ maxWidth: '450px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header-v2">
              <h3>{t("fund.member.actions.voluntaryContribution")}</h3>
              <button onClick={() => setShowGeneralForm(false)} className="close-btn">&times;</button>
            </div>
            <div className="modal-body-v2">
              {successMsg ? <div className="success-screen"><h3>{successMsg}</h3></div> : (
                <form onSubmit={handleGeneralSubmit} className="premium-form">
                  <div className="method-switcher-v3" style={{ marginBottom: '1.5rem' }}>
                    <label className={generalData.method === paymentMethods.cash ? 'active' : ''}>
                      <input type="radio" value={paymentMethods.cash} checked={generalData.method === paymentMethods.cash} onChange={e => setGeneralData({ ...generalData, method: e.target.value })} />
                      {t("fund.methods.cash")}
                    </label>
                    <label className={generalData.method === paymentMethods.transfer ? 'active' : ''}>
                      <input type="radio" value={paymentMethods.transfer} checked={generalData.method === paymentMethods.transfer} onChange={e => setGeneralData({ ...generalData, method: e.target.value })} />
                      {t("fund.methods.transfer")}
                    </label>
                  </div>
                  <div className="form-group"><label>{t("fund.modal.form.amount")}</label><input type="number" required value={generalData.amount} onChange={e => setGeneralData({ ...generalData, amount: e.target.value })} /></div>
                  <div className="form-group"><label>{t("fund.modal.transactionDetail.content")}</label><textarea required value={generalData.note} onChange={e => setGeneralData({ ...generalData, note: e.target.value })}></textarea></div>
                  <button type="submit" className="btn-premium btn-gold" style={{ width: '100%', marginTop: '1rem' }} disabled={submitting}>{t("fund.member.actions.sendContribution")}</button>
                </form>
              )}
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
                  <span>{getMethodLabel(selectedTransaction.method)}</span>
                </div>
                <div className="detail-row">
                  <label>{t("fund.modal.transactionDetail.content")}:</label>
                  <span>{selectedTransaction.note}</span>
                </div>
                {selectedTransaction.person_name && (
                  <div className="detail-row">
                    <label>{selectedTransaction.type === 'income' ? `${t("fund.modal.transactionDetail.payer")}:` : `${t("fund.modal.transactionDetail.recipient")}:`}</label>
                    <span>{selectedTransaction.person_name}</span>
                  </div>
                )}
                {selectedTransaction.manager_note && (
                  <div className="detail-row" style={{ marginTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '1rem' }}>
                    <label>{t("fund.modal.transactionDetail.managerNote")}:</label>
                    <p style={{ fontStyle: 'italic', color: 'rgba(255,255,255,0.7)' }}>{selectedTransaction.manager_note}</p>
                  </div>
                )}
                {selectedTransaction.recipient_note && (
                  <div className="detail-row" style={{ marginTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '1rem' }}>
                    <label>{t("fund.modal.transactionDetail.recipientNote")}:</label>
                    <p style={{ fontStyle: 'italic', color: 'rgba(255,255,255,0.7)' }}>{selectedTransaction.recipient_note}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}


    </div>
  );
}

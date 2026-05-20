import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatDateTimeVN, formatDateVN } from "../../../shared/utils/dateFormat";
import {
  getBillingPlans,
  getClanBilling,
  getClanPayments,
  manualUpgradeClan,
  createBillingPlan,
  updateBillingPlan,
} from "../../../api/billingService";
import { getStats, getManagerTree } from "../../../api/managerService";
import { getAdminClans } from "../../../api/adminService";
import {
  createSepayPayment,
  getPaymentStatus,
  cancelPendingPayment,
} from "../../../api/paymentService";
import "./BillingPage.css";

function readJsonStorage(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function normalizeRole(roleName, roleId) {
  const normalized = String(roleName || "").trim().toLowerCase();

  if (
    normalized.includes("admin") ||
    normalized.includes("administrator") ||
    normalized.includes("quản trị") ||
    normalized.includes("quan tri")
  ) {
    return "admin";
  }

  if (
    normalized.includes("manager") ||
    normalized.includes("quản lý") ||
    normalized.includes("quan ly") ||
    normalized.includes("tộc trưởng") ||
    normalized.includes("toc truong")
  ) {
    return "manager";
  }

  if (
    normalized.includes("member") ||
    normalized.includes("thành viên") ||
    normalized.includes("thanh vien")
  ) {
    return "member";
  }

  if (Number(roleId) === 1) return "admin";
  if (Number(roleId) === 2) return "manager";
  if (Number(roleId) === 3) return "member";

  return normalized || "";
}

function getRoleFromToken() {
  try {
    const token = localStorage.getItem("token");
    if (!token) return "";

    const payload = JSON.parse(atob(token.split(".")[1]));

    return normalizeRole(
      payload?.role_name || payload?.roleName || payload?.role,
      payload?.role_id || payload?.roleId
    );
  } catch {
    return "";
  }
}

function getCurrentUserRole() {
  const authUser = readJsonStorage("auth_user");
  const user = readJsonStorage("user");

  const source = authUser || user || {};

  const roleName =
    source.role_name ||
    source.roleName ||
    source.role ||
    source.user?.role_name ||
    source.user?.roleName ||
    source.user?.role;

  const roleId =
    source.role_id ||
    source.roleId ||
    source.user?.role_id ||
    source.user?.roleId;

  const roleFromStorage = normalizeRole(roleName, roleId);

  if (roleFromStorage) return roleFromStorage;

  return getRoleFromToken();
}

function resolveClanIdFromResponse(...responses) {
  for (const response of responses) {
    const clanId =
      response?.clan?.id ||
      response?.data?.clan?.id ||
      response?.clan_id ||
      response?.clanId ||
      response?.data?.clan_id ||
      response?.data?.clanId ||
      response?.stats?.clan_id ||
      response?.stats?.clanId;

    if (clanId) return clanId;

    const firstPersonClanId =
      response?.people?.[0]?.clan_id ||
      response?.data?.people?.[0]?.clan_id ||
      response?.tree?.people?.[0]?.clan_id;

    if (firstPersonClanId) return firstPersonClanId;
  }

  return null;
}

function normalizeClansResponse(response) {
  if (Array.isArray(response)) return response;
  if (Array.isArray(response?.clans)) return response.clans;
  if (Array.isArray(response?.data?.clans)) return response.data.clans;
  return [];
}

function getClanName(clan) {
  return clan?.clan_name || clan?.name || `Clan #${clan?.id}`;
}

function getPlanCodeKey(planCodeOrName) {
  return (
    String(planCodeOrName || "")
      .trim()
      .toLowerCase()
      .replace(/family\s*plus/g, "plus")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "unknown"
  );
}

function formatMoney(value) {
  return `${Number(value || 0).toLocaleString("vi-VN")}đ`;
}

function getEmptyPlanForm() {
  return {
    code: "",
    name: "",
    description: "",
    price_vnd: 0,
    billing_cycle: "monthly",
    person_limit: 0,
    account_limit: 0,
    is_active: true,
  };
}

function toPlanForm(plan) {
  return {
    code: plan?.code || "",
    name: plan?.name || "",
    description: plan?.description || "",
    price_vnd: Number(plan?.price_vnd || 0),
    billing_cycle: plan?.billing_cycle || "monthly",
    person_limit: Number(plan?.person_limit || 0),
    account_limit: Number(plan?.account_limit || 0),
    is_active: plan?.is_active !== 0 && plan?.is_active !== false,
  };
}

export default function BillingPage() {
  const { t } = useTranslation();
  const [clanId, setClanId] = useState(null);
  const [adminClans, setAdminClans] = useState([]);
  const [billing, setBilling] = useState(null);
  const [plans, setPlans] = useState([]);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [billingLoading, setBillingLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [paymentDialog, setPaymentDialog] = useState(null);
  const [paymentChecking, setPaymentChecking] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState(null);
  const [paymentActionLoading, setPaymentActionLoading] = useState(false);
  const [planEditorOpen, setPlanEditorOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState(null);
  const [planForm, setPlanForm] = useState(getEmptyPlanForm());
  const [planSaving, setPlanSaving] = useState(false);

  const currentRole = getCurrentUserRole();
  const isAdmin = currentRole === "admin";
  const planRank = {
  FREE: 0,
  BASIC: 1,
  PRO: 2,
  PLUS: 3,
};

const normalizePlanCode = (planCode) => {
  return String(planCode || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_")
    .replace(/-/g, "_");
};

const getPlanRank = (planCode) => {
  return planRank[normalizePlanCode(planCode)] ?? 0;
};

const isBillingActive =
  billing?.status === "active" &&
  billing?.expires_at &&
  new Date(billing.expires_at) > new Date();

const currentPlanRank = getPlanRank(billing?.plan_code);

const activePendingPayment = payments.find((payment) => {
  return String(payment.status || "").toLowerCase() === "pending";
});

const isPaymentExpired = (payment) => {
  return String(payment?.status || "").toLowerCase() === "cancelled";
};

const isPlanDowngrade = (planCode) => {
  return isBillingActive && getPlanRank(planCode) < currentPlanRank;
};

const getPaymentStatusText = (payment, t) => {
  const status = String(payment?.status || "pending").toLowerCase();

  if (status === "paid") {
    return t("billingPayment.status.paid");
  }

  if (status === "pending") {
    if (isPaymentExpired(payment)) {
      return t("billingPayment.status.pendingExpired");
    }

    if (isPlanDowngrade(payment.plan_code)) {
      return t("billingPayment.status.pendingDowngrade");
    }

    return t("billingPayment.status.pendingActive");
  }

  if (status === "cancelled") {
    return t("billingPayment.status.cancelled");
  }

  return t("billingPayment.status.ended");
};

const getPlanNameText = (plan) => {
  const key = getPlanCodeKey(plan?.code || plan?.plan_code || plan?.name || plan?.plan_name);
  return t(`billingPayment.planCatalog.${key}.name`, {
    defaultValue: plan?.name || plan?.plan_name || plan?.code || plan?.plan_code || t("billingPayment.history.unknown"),
  });
};

const getPlanDescriptionText = (plan) => {
  const key = getPlanCodeKey(plan?.code || plan?.plan_code || plan?.name || plan?.plan_name);
  return t(`billingPayment.planCatalog.${key}.description`, {
    defaultValue: plan?.description || "",
  });
};

const getStatusText = (status) =>
  t(`billingPayment.statusLabel.${String(status || "pending").toLowerCase()}`, {
    defaultValue: status || "pending",
  });

  const loadBillingForClan = async (targetClanId) => {
    if (!targetClanId) {
      setBilling(null);
      setPayments([]);
      return;
    }

    try {
      setBillingLoading(true);
      setMessage("");

      const [plansResult, billingResult, paymentsResult] = await Promise.all([
        getBillingPlans(),
        getClanBilling(targetClanId),
        getClanPayments(targetClanId),
      ]);

      setPlans(plansResult?.plans || []);
      setBilling(billingResult?.billing || null);
      setPayments(paymentsResult?.payments || []);
    } catch (error) {
      console.error("loadBillingForClan error:", error);
      setBilling(null);
      setPayments([]);
      setMessage(error.message || t("billingPayment.messages.loadError"));
    } finally {
      setBillingLoading(false);
    }
  };

  const loadInitialData = async () => {
    try {
      setLoading(true);
      setMessage("");

      if (isAdmin) {
        const clansResult = await getAdminClans("all");
        const clans = normalizeClansResponse(clansResult);

        setAdminClans(clans);

        const firstClanId = clans[0]?.id || null;

        if (!firstClanId) {
          setClanId(null);
          setBilling(null);
          setPayments([]);
          setMessage(t("billingPayment.messages.noClans"));
          return;
        }

        setClanId(firstClanId);
        await loadBillingForClan(firstClanId);
        return;
      }

      const [statsResult, treeResult] = await Promise.all([
        getStats().catch(() => null),
        getManagerTree().catch(() => null),
      ]);

      const resolvedClanId =
        resolveClanIdFromResponse(statsResult, treeResult) ||
        localStorage.getItem("clan_id");

      if (!resolvedClanId) {
        setClanId(null);
        setBilling(null);
        setPayments([]);
        setMessage(t("billingPayment.messages.unknownClan"));
        return;
      }

      setClanId(resolvedClanId);
      await loadBillingForClan(resolvedClanId);
    } catch (error) {
      console.error("loadInitialData error:", error);
      setMessage(error.message || t("billingPayment.messages.loadDataError"));
    } finally {
      setLoading(false);
    }
  };

  const handleClanChange = async (event) => {
    const nextClanId = event.target.value;

    setClanId(nextClanId);
    setPaymentDialog(null);
    setSelectedPayment(null);

    await loadBillingForClan(nextClanId);
  };


  const openCreatePlanEditor = () => {
    setEditingPlan(null);
    setPlanForm(getEmptyPlanForm());
    setPlanEditorOpen(true);
    setMessage("");
  };

  const openEditPlanEditor = (plan) => {
    setEditingPlan(plan);
    setPlanForm(toPlanForm(plan));
    setPlanEditorOpen(true);
    setMessage("");
  };

  const closePlanEditor = () => {
    setPlanEditorOpen(false);
    setEditingPlan(null);
    setPlanForm(getEmptyPlanForm());
  };

  const updatePlanFormField = (field, value) => {
    setPlanForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSavePlan = async (event) => {
    event.preventDefault();
    try {
      setPlanSaving(true);
      setMessage("");

      const payload = {
        ...planForm,
        price_vnd: Number(planForm.price_vnd || 0),
        person_limit: Number(planForm.person_limit || 0),
        account_limit: Number(planForm.account_limit || 0),
        is_active: Boolean(planForm.is_active),
      };

      if (editingPlan?.id) {
        await updateBillingPlan(editingPlan.id, payload);
        setMessage("Đã cập nhật gói sử dụng thành công.");
      } else {
        await createBillingPlan(payload);
        setMessage("Đã thêm gói sử dụng thành công.");
      }

      const plansResult = await getBillingPlans();
      setPlans(plansResult?.plans || []);
      if (clanId) await loadBillingForClan(clanId);
      closePlanEditor();
    } catch (error) {
      setMessage(error.message || "Không thể lưu gói sử dụng.");
    } finally {
      setPlanSaving(false);
    }
  };

  const handleCreateSepayPayment = async (plan) => {
    try {
      setMessage("");
      if (activePendingPayment) {
        setSelectedPayment(activePendingPayment);
        setMessage(t("billingPayment.messages.pendingExists"));
        return;
      }

      if (isPlanDowngrade(plan.code)) {
        setMessage(t("billingPayment.messages.downgradeError"));
        return;
      }

      const payload = isAdmin
        ? {
            clan_id: clanId,
            plan_code: plan.code,
          }
        : {
            plan_code: plan.code,
          };

      const result = await createSepayPayment(payload);

      setPaymentDialog({
        plan,
        orderCode: result.order_code,
        amountVnd: result.amount_vnd,
        transferContent: result.transfer_content,
        qrUrl: result.qr_url,
        bankBin: result.bank_bin,
        bankAccount: result.bank_account,
        accountName: result.account_name,
        status: "pending",
      });
    } catch (error) {
      setMessage(error.message || t("billingPayment.messages.createError"));
    }
  };

  const checkCurrentPaymentStatus = async () => {
    if (!paymentDialog?.orderCode) return;

    try {
      setPaymentChecking(true);
      setMessage("");

      const result = await getPaymentStatus(paymentDialog.orderCode);
      const payment = result?.payment;

      if (payment?.status === "paid") {
        setPaymentDialog((prev) =>
          prev
            ? {
                ...prev,
                status: "paid",
              }
            : prev
        );

        await loadBillingForClan(clanId);
        setMessage(t("billingPayment.messages.paySuccess"));
        return;
      }

      setPaymentDialog((prev) =>
        prev
          ? {
              ...prev,
              status: payment?.status || "pending",
            }
          : prev
      );

      setMessage(t("billingPayment.messages.payNotConfirmed"));
    } catch (error) {
      setMessage(error.message || t("billingPayment.messages.checkStatusError"));
    } finally {
      setPaymentChecking(false);
    }
  };
  
  const handleCancelPendingPayment = async (payment) => {
  if (!payment?.id) {
    return;
  }

  const ok = window.confirm(t("billingPayment.messages.cancelConfirm"));

  if (!ok) {
    return;
  }

  try {
    setPaymentActionLoading(true);
    setMessage("");

    await cancelPendingPayment(payment.id);

    setSelectedPayment(null);
    setPaymentDialog(null);

    await loadBillingForClan(clanId);

    setMessage(t("billingPayment.messages.cancelSuccess"));
  } catch (error) {
    setMessage(error.message || t("billingPayment.messages.cancelError"));
  } finally {
    setPaymentActionLoading(false);
  }
};

const handlePaySelectedPayment = (payment) => {
  if (!payment) {
    return;
  }

  const status = String(payment.status || "").toLowerCase();

  if (status === "paid") {
    setMessage(t("billingPayment.status.paid"));
    return;
  }

  if (status !== "pending") {
    setMessage(t("billingPayment.status.ended"));
    return;
  }

  if (isPaymentExpired(payment)) {
    setMessage(t("billingPayment.messages.expiredAlert"));
    return;
  }

  if (isPlanDowngrade(payment.plan_code)) {
    setMessage(t("billingPayment.status.pendingDowngrade"));
    return;
  }

  setPaymentDialog({
    plan: {
      name: payment.plan_name || payment.plan_code || t("billingPayment.history.unknown"),
      code: payment.plan_code,
    },
    orderCode: payment.order_code,
    amountVnd: payment.amount_vnd,
    transferContent:
      payment.transfer_content || `Thanh toan ${payment.order_code}`,
    qrUrl: payment.qr_url,
    bankBin: payment.bank_bin,
    bankAccount: payment.bank_account,
    accountName: payment.account_name,
    status: payment.status || "pending",
  });
};
  useEffect(() => {
    loadInitialData();
  }, []);

  const usagePeoplePercent = billing?.person_limit ? Math.min(100, Math.round((Number(billing.current_people || 0) / Number(billing.person_limit || 1)) * 100)) : 0;
  const usageAccountsPercent = billing?.account_limit ? Math.min(100, Math.round((Number(billing.current_accounts || 0) / Number(billing.account_limit || 1)) * 100)) : 0;

  if (loading) {
    return (
      <div className="billing-page billing-page--loading">
        <div className="billing-card billing-loading-card">
          <span className="material-symbols-outlined">hourglass_top</span>
          <h1>{t("billingPayment.messages.loading")}</h1>
          <p>{t("billingPayment.messages.loadingDesc")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="billing-page">
      <section className="billing-hero">
        <div>
          <span className="billing-kicker">{t("billingPayment.hero.kicker")}</span>
          <h1>{t("billingPayment.hero.title")}</h1>
          <p>{t("billingPayment.hero.subtitle")}</p>
        </div>
        {billing && (
          <div className="billing-current-pill">
            <span>{t("billingPayment.currentPlan.title")}</span>
            <strong>{getPlanNameText(billing)}</strong>
          </div>
        )}
      </section>

      {isAdmin && (
        <section className="billing-alert billing-alert--admin">
          <span className="material-symbols-outlined">admin_panel_settings</span>
          <div>
            <strong>{t("billingPayment.alerts.adminTitle")}</strong>
            <p>{t("billingPayment.alerts.adminDesc")}</p>
            <label>{t("billingPayment.alerts.adminSelectClan")}</label>
            <select value={clanId || ""} onChange={handleClanChange}>
              {adminClans.map((clan) => (
                <option key={clan.id} value={clan.id}>
                  #{clan.id} - {getClanName(clan)}
                </option>
              ))}
            </select>
          </div>
        </section>
      )}

      {!isAdmin && (
        <section className="billing-alert billing-alert--pay">
          <span className="material-symbols-outlined">qr_code_2</span>
          <div>
            <strong>{t("billingPayment.alerts.payReadyTitle")}</strong>
            <p>{t("billingPayment.alerts.payReadyDesc")}</p>
          </div>
        </section>
      )}


      {billingLoading && (
        <section className="billing-alert billing-alert--loading">
          <span className="material-symbols-outlined">sync</span>
          <div>{t("billingPayment.alerts.loadingBilling")}</div>
        </section>
      )}

      {billing && (
  <section className="billing-overview-grid">
    <article className="billing-card billing-current-card">
      <div className="billing-card-head">
        <div>
          <span className="billing-kicker">{t("billingPayment.currentPlan.title")}</span>
          <h2>{getPlanNameText(billing)}</h2>
        </div>
        <span className="billing-status-badge">{getStatusText(billing.status)}</span>
      </div>

      <div className="billing-info-list">
        <div>
          <span>Clan ID</span>
          <strong>#{clanId}</strong>
        </div>
        <div>
          <span>{t("billingPayment.currentPlan.expiresAt")}</span>
          <strong>
            {billing.expires_at
              ? formatDateVN(billing.expires_at)
              : t("billingPayment.currentPlan.unlimited")}
          </strong>
        </div>
      </div>

      <div className="billing-usage-block">
        <div className="billing-usage-title">
          <span>{t("billingPayment.currentPlan.records")}</span>
          <strong>
            {billing.current_people} / {billing.person_limit}
          </strong>
        </div>
        <div className="billing-progress">
          <span style={{ width: `${usagePeoplePercent}%` }} />
        </div>
      </div>

      <div className="billing-usage-block">
        <div className="billing-usage-title">
          <span>{t("billingPayment.currentPlan.accounts")}</span>
          <strong>
            {billing.current_accounts} / {billing.account_limit}
          </strong>
        </div>
        <div className="billing-progress">
          <span style={{ width: `${usageAccountsPercent}%` }} />
        </div>
      </div>

      {(billing.is_person_limit_reached || billing.is_account_limit_reached) && (
        <div className="billing-limit-warning">
          <span className="material-symbols-outlined">warning</span>
          <span>
            {t("billingPayment.currentPlan.limitReached")}
          </span>
        </div>
      )}
    </article>

    <article className="billing-card billing-history-card">
      <div className="billing-card-head">
        <div>
          <span className="billing-kicker">{t("billingPayment.transactionDetail.title")}</span>
          <h2>{t("billingPayment.history.title")}</h2>
        </div>
        <span className="billing-count-pill">{t("billingPayment.history.count", { count: payments.length })}</span>
      </div>

      {payments.length === 0 ? (
        <div className="billing-empty-state">
          <span className="material-symbols-outlined">receipt_long</span>
          <p>{t("billingPayment.history.noTransactions")}</p>
        </div>
      ) : (
        <div className="billing-payment-list">
          {payments.map((payment) => (
            <div
              className="billing-payment-row"
              key={payment.id}
              onClick={() => setSelectedPayment(payment)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setSelectedPayment(payment);
                }
              }}
              role="button"
              tabIndex={0}
            >
              <div>
                <strong>
                  {getPlanNameText(payment)}
                </strong>
                <span>
                  {payment.payer_email || t("billingPayment.history.unknown")} ·{" "}
                  {payment.provider || "manual"}
                </span>
              </div>

              <div className="billing-payment-meta">
                <strong>{formatMoney(payment.amount_vnd)}</strong>
                <span>
                  {payment.paid_at
                    ? formatDateTimeVN(payment.paid_at)
                    : t("billingPayment.history.unpaid")}
                </span>
              </div>

              <span
                className={`billing-payment-status is-${String(
                  payment.status || "pending"
                ).toLowerCase()}`}
              >
                {getStatusText(payment.status)}
              </span>
            </div>
          ))}
        </div>
      )}
    </article>
  </section>
)}

{selectedPayment && (
  <section className="billing-card billing-transaction-detail">
    <div className="billing-card-head">
      <div>
        <span className="billing-kicker">{t("billingPayment.transactionDetail.title")}</span>
        <h2>
          {getPlanNameText(selectedPayment)}
        </h2>
      </div>

      <button
        type="button"
        className="billing-secondary-btn"
        onClick={() => setSelectedPayment(null)}
      >
        {t("common.close") || "Close"}
      </button>
    </div>

    <div className="billing-info-list is-payment">
      <div>
        <span>{t("billingPayment.transactionDetail.orderCode")}</span>
        <strong>{selectedPayment.order_code || selectedPayment.id}</strong>
      </div>

      <div>
        <span>{t("billingPayment.transactionDetail.plan")}</span>
        <strong>
          {getPlanNameText(selectedPayment)}
        </strong>
      </div>

      <div>
        <span>{t("billingPayment.transactionDetail.amount")}</span>
        <strong>{formatMoney(selectedPayment.amount_vnd)}</strong>
      </div>

      <div>
        <span>{t("billingPayment.transactionDetail.status")}</span>
        <strong>{getStatusText(selectedPayment.status)}</strong>
      </div>

      <div>
        <span>{t("billingPayment.transactionDetail.createdAt")}</span>
        <strong>
          {selectedPayment.created_at
            ? formatDateTimeVN(selectedPayment.created_at)
            : t("billingPayment.history.unknown")}
        </strong>
      </div>

      <div>
        <span>{t("billingPayment.transactionDetail.paidAt")}</span>
        <strong>
          {selectedPayment.paid_at
            ? formatDateTimeVN(selectedPayment.paid_at)
            : t("billingPayment.history.unpaid")}
        </strong>
      </div>

      <div>
        <span>{t("billingPayment.transactionDetail.email")}</span>
        <strong>{selectedPayment.payer_email || t("billingPayment.history.unknown")}</strong>
      </div>

      <div>
        <span>{t("billingPayment.transactionDetail.provider")}</span>
        <strong>{selectedPayment.provider || "manual"}</strong>
      </div>
    </div>

    <div className="billing-transaction-note">
      {getPaymentStatusText(selectedPayment, t)}
    </div>

    <div className="billing-actions-row">
      <button
        type="button"
        className="billing-primary-btn"
        disabled={
          paymentActionLoading ||
          String(selectedPayment.status || "").toLowerCase() !== "pending" ||
          isPaymentExpired(selectedPayment) ||
          isPlanDowngrade(selectedPayment.plan_code)
        }
        onClick={() => handlePaySelectedPayment(selectedPayment)}
      >
        {String(selectedPayment.status || "").toLowerCase() === "paid"
          ? t("billingPayment.transactionDetail.actions.paid")
          : isPaymentExpired(selectedPayment)
            ? t("billingPayment.transactionDetail.actions.cancelled")
            : isPlanDowngrade(selectedPayment.plan_code)
              ? t("billingPayment.transactionDetail.actions.cannotDowngrade")
              : t("billingPayment.transactionDetail.actions.payNow")}
      </button>

      {String(selectedPayment.status || "").toLowerCase() === "pending" &&
        !isPaymentExpired(selectedPayment) && (
          <button
            type="button"
            className="billing-danger-btn"
            disabled={paymentActionLoading}
            onClick={() => handleCancelPendingPayment(selectedPayment)}
          >
            {paymentActionLoading ? t("common.submitting") : t("billingPayment.transactionDetail.actions.cancel")}
          </button>
        )}
    </div>
  </section>
)}
      {paymentDialog && (
        <section className="billing-card billing-payment-dialog">
          <div className="billing-card-head">
            <div>
              <span className="billing-kicker">{t("billingPayment.paymentDialog.title")}</span>
              <h2>{getPlanNameText(paymentDialog.plan)}</h2>
            </div>
            <span className="billing-status-badge">{getStatusText(paymentDialog.status)}</span>
          </div>

          <div className="billing-payment-content">
            <div>
              <div className="billing-info-list is-payment">
                <div><span>{t("billingPayment.paymentDialog.amount")}</span><strong>{formatMoney(paymentDialog.amountVnd)}</strong></div>
                <div><span>{t("billingPayment.paymentDialog.content")}</span><strong>{paymentDialog.transferContent}</strong></div>
                <div><span>{t("billingPayment.paymentDialog.recipient")}</span><strong>{paymentDialog.bankAccount || t("billingPayment.paymentDialog.notConfigured")} - {paymentDialog.accountName || t("billingPayment.paymentDialog.notConfigured")}</strong></div>
              </div>
              <div className="billing-actions-row">
                <button type="button" className="billing-primary-btn" onClick={checkCurrentPaymentStatus} disabled={paymentChecking}>
                  {paymentChecking ? t("billingPayment.paymentDialog.checking") : t("billingPayment.paymentDialog.verify")}
                </button>
                <button type="button" className="billing-secondary-btn" onClick={() => setPaymentDialog(null)}>
                  {t("common.close") || "Close"}
                </button>
              </div>
            </div>
            {paymentDialog.qrUrl ? (
              <div className="billing-qr-box">
                <img src={paymentDialog.qrUrl} alt="QR thanh toán SePay" />
                <span>{t("billingPayment.paymentDialog.scanQR")}</span>
              </div>
            ) : (
              <div className="billing-qr-box is-empty">{t("billingPayment.paymentDialog.qrError")}</div>
            )}
          </div>
        </section>
      )}
      {message && (
        <section
          className={`billing-alert ${
            message.includes("thành công") || message.includes("Đã nâng cấp")
              ? "billing-alert--success"
              : "billing-alert--error"
          }`}
        >
          <span className="material-symbols-outlined">
            {message.includes("thành công") || message.includes("Đã nâng cấp")
              ? "check_circle"
              : "error"}
          </span>
          <div>{message}</div>
        </section>
      )}

      {isAdmin && (
        <section className="billing-card billing-admin-plan-manager">
          <div className="billing-card-head">
            <div>
              <span className="billing-kicker">Quản trị gói sử dụng</span>
              <h2>Thêm và sửa gói</h2>
            </div>
            <button type="button" className="billing-primary-btn" onClick={openCreatePlanEditor}>
              <span className="material-symbols-outlined">add</span>
              Thêm gói
            </button>
          </div>

          {planEditorOpen && (
            <form className="billing-plan-form" onSubmit={handleSavePlan}>
              <div className="billing-plan-form-grid">
                <label>
                  Mã gói
                  <input
                    value={planForm.code}
                    onChange={(event) => updatePlanFormField("code", event.target.value)}
                    placeholder="VD: BASIC"
                    required
                  />
                </label>
                <label>
                  Tên gói
                  <input
                    value={planForm.name}
                    onChange={(event) => updatePlanFormField("name", event.target.value)}
                    placeholder="VD: Basic"
                    required
                  />
                </label>
                <label>
                  Giá VND
                  <input
                    type="number"
                    min="0"
                    value={planForm.price_vnd}
                    onChange={(event) => updatePlanFormField("price_vnd", event.target.value)}
                    required
                  />
                </label>
                <label>
                  Chu kỳ
                  <select
                    value={planForm.billing_cycle}
                    onChange={(event) => updatePlanFormField("billing_cycle", event.target.value)}
                  >
                    <option value="free">Miễn phí</option>
                    <option value="monthly">Theo tháng</option>
                    <option value="yearly">Theo năm</option>
                  </select>
                </label>
                <label>
                  Giới hạn hồ sơ
                  <input
                    type="number"
                    min="0"
                    value={planForm.person_limit}
                    onChange={(event) => updatePlanFormField("person_limit", event.target.value)}
                    required
                  />
                </label>
                <label>
                  Giới hạn tài khoản
                  <input
                    type="number"
                    min="0"
                    value={planForm.account_limit}
                    onChange={(event) => updatePlanFormField("account_limit", event.target.value)}
                    required
                  />
                </label>
                <label className="billing-plan-form-wide">
                  Mô tả
                  <textarea
                    rows={3}
                    value={planForm.description}
                    onChange={(event) => updatePlanFormField("description", event.target.value)}
                    placeholder="Mô tả ngắn về gói"
                  />
                </label>
                <label className="billing-plan-active-check">
                  <input
                    type="checkbox"
                    checked={Boolean(planForm.is_active)}
                    onChange={(event) => updatePlanFormField("is_active", event.target.checked)}
                  />
                  Đang kích hoạt
                </label>
              </div>
              <div className="billing-actions-row">
                <button type="submit" className="billing-primary-btn" disabled={planSaving}>
                  {planSaving ? "Đang lưu..." : editingPlan ? "Lưu thay đổi" : "Thêm gói"}
                </button>
                <button type="button" className="billing-secondary-btn" onClick={closePlanEditor} disabled={planSaving}>
                  Hủy
                </button>
              </div>
            </form>
          )}
        </section>
      )}

      <section className="billing-plans-section">
  <div className="billing-section-title">
    <span className="billing-kicker">{t("billingPayment.plans.title")}</span>
    <h2>{t("billingPayment.plans.subtitle")}</h2>
  </div>
        <div className="billing-plan-grid">
          {plans.map((plan) => {
            const isCurrent = billing?.plan_code === plan.code;
            const isDowngrade = isPlanDowngrade(plan.code);
            const hasActivePending = Boolean(activePendingPayment);
            const isFeatured = String(plan.code || "").toLowerCase().includes("pro") || String(plan.name || "").toLowerCase().includes("pro");

            return (
              <article key={plan.id} className={`billing-plan-card ${isCurrent ? "is-current" : ""} ${isFeatured ? "is-featured" : ""}`}>
                {isCurrent && <span className="billing-plan-ribbon">{t("billingPayment.plans.current")}</span>}
                {isFeatured && !isCurrent && <span className="billing-plan-ribbon is-featured-ribbon">{t("billingPayment.plans.featured")}</span>}
                <h3>{getPlanNameText(plan)}</h3>
                <p>{getPlanDescriptionText(plan)}</p>
                <div className="billing-plan-price">
                  <strong>{formatMoney(plan.price_vnd)}</strong>
                  {plan.billing_cycle === "monthly" ? <span>{t("billingPayment.plans.monthly")}</span> : null}
                </div>
                <ul>
                  <li><span className="material-symbols-outlined">account_tree</span>{plan.person_limit} {t("billingPayment.plans.recordsUnit")}</li>
                  <li><span className="material-symbols-outlined">group</span>{plan.account_limit} {t("billingPayment.plans.accountsUnit")}</li>
                  {isAdmin && <li><span className="material-symbols-outlined">toggle_on</span>{plan.is_active === 0 ? "Tạm ẩn" : "Đang kích hoạt"}</li>}
                </ul>

                {isAdmin && (
                  <button
                    type="button"
                    className="billing-secondary-btn billing-edit-plan-btn"
                    onClick={() => openEditPlanEditor(plan)}
                  >
                    Sửa gói
                  </button>
                )}

                {isCurrent ? (
                  <button type="button" className="billing-disabled-btn" disabled>{t("billingPayment.plans.current")}</button>
                ) : isAdmin ? (
                  <button
                    type="button"
                    className="billing-primary-btn"
                    onClick={async () => {
                      const ok = window.confirm(t("billingPayment.messages.upgradeTestConfirm", { id: clanId, name: getPlanNameText(plan) }));
                      if (!ok) return;
                      try {
                        setMessage("");
                        await manualUpgradeClan(clanId, { plan_code: plan.code, months: 1 });
                        await loadBillingForClan(clanId);
                        setMessage(t("billingPayment.messages.upgradeTestSuccess", { id: clanId, name: getPlanNameText(plan) }));
                      } catch (error) {
                        setMessage(error.message || t("billingPayment.messages.upgradeTestError"));
                      }
                    }}
                  >
                    {t("billingPayment.plans.upgradeTest")}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="billing-primary-btn"
                    disabled={hasActivePending || isDowngrade}
                    onClick={() => handleCreateSepayPayment(plan)}
                  >
                    {hasActivePending
                      ? t("billingPayment.plans.pending")
                      : isDowngrade
                        ? t("billingPayment.plans.cannotDowngrade")
                        : t("billingPayment.plans.upgradeNow")}
                  </button>
                )}
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}

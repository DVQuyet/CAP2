import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  getDashboardData,
  getMembers,
  getFundOverviewAPI,
  getFundTransactionsAPI,
  getManagerTree,
} from "../../../api/managerService";
import ManagerDashboardCharts from "../components/ManagerDashboardCharts";
import { getStoredUser } from "../../../shared/utils/auth";
import { formatDateTime } from "../utils/managerData";
import { useLanguage } from "../../../i18n/LanguageContext";

export default function ManagerDashboard() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const currentUser = getStoredUser();
  const [stats, setStats] = useState({ total_members: 0, total_managers: 0, total_pending: 0 });

  const [pendingUsers, setPendingUsers] = useState([]);
  const [pendingPosts, setPendingPosts] = useState([]);
  const [pendingProfiles, setPendingProfiles] = useState([]);
  const [tasks, setTasks] = useState([]);

  const [members, setMembers] = useState([]);
  const [fundOverview, setFundOverview] = useState(null);
  const [fundTransactions, setFundTransactions] = useState([]);
  const [families, setFamilies] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const formatMoney = (value) =>
    new Intl.NumberFormat("vi-VN", {
      style: "currency",
      currency: "VND",
      maximumFractionDigits: 0,
    }).format(Number(value || 0));

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const [data, memberData, fundData, transactionData, treeData] =
        await Promise.all([
          getDashboardData(),
          getMembers().catch(() => ({ members: [] })),
          getFundOverviewAPI().catch(() => null),
          getFundTransactionsAPI().catch(() => ({ transactions: [] })),
          getManagerTree().catch(() => ({ treeMembers: [], families: [] })),
        ]);

      setStats(data.stats || {});
      setPendingUsers(data.pendingUsers || []);
      setPendingPosts(data.pendingPosts || []);
      setPendingProfiles(data.pendingProfiles || []);
      setTasks(data.tasks || []);

      const loadedMembers = Array.isArray(memberData)
        ? memberData
        : memberData?.members || [];

      const treeMembers = Array.isArray(treeData?.treeMembers)
        ? treeData.treeMembers
        : [];

      setMembers(treeMembers.length > 0 ? treeMembers : loadedMembers);
      setFundOverview(fundData?.overview || fundData || null);
      setFundTransactions(transactionData?.transactions || []);
      setFamilies(treeData?.families || []);
    } catch (err) {
      setError(err?.message || t("manager.dashboard.messages.loadError"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const activeTasks = useMemo(
    () => tasks.filter((task) => task.status !== "completed").length,
    [tasks]
  );

  const totalPending =
    pendingUsers.length + pendingPosts.length + pendingProfiles.length;

  const billingUsage = stats?.billing_usage || null;
  const formatLimit = (current, limit) => {
    const numericLimit = Number(limit || 0);
    return numericLimit > 0 ? `${Number(current || 0).toLocaleString("vi-VN")} / ${numericLimit.toLocaleString("vi-VN")}` : `${Number(current || 0).toLocaleString("vi-VN")} / ${t("manager.dashboard.usage.unlimited")}`;
  };
  const getUsagePercent = (current, limit, fallback) => {
    const numericFallback = Number(fallback || 0);
    if (Number.isFinite(numericFallback) && numericFallback > 0) return Math.min(100, numericFallback);
    const numericLimit = Number(limit || 0);
    if (numericLimit <= 0) return 0;
    return Math.min(100, Math.round((Number(current || 0) / numericLimit) * 100));
  };
  const peopleUsagePercent = getUsagePercent(
    billingUsage?.current_people ?? stats.total_members,
    billingUsage?.person_limit,
    billingUsage?.people_usage_percent
  );
  const accountUsagePercent = getUsagePercent(
    billingUsage?.current_accounts ?? stats.total_accounts,
    billingUsage?.account_limit,
    billingUsage?.account_usage_percent
  );
  const isUsageWarning = peopleUsagePercent >= 80 || accountUsagePercent >= 80;
  const getUsageTone = (percent) => {
    if (percent >= 100) return "danger";
    if (percent >= 80) return "warning";
    return "safe";
  };
  const getRemaining = (current, limit) => {
    const numericLimit = Number(limit || 0);
    if (numericLimit <= 0) return t("manager.dashboard.usage.unlimited");
    return Math.max(0, numericLimit - Number(current || 0)).toLocaleString("vi-VN");
  };
  const usageItems = [
    {
      key: "profiles",
      icon: "diversity_3",
      label: t("manager.dashboard.usage.profiles"),
      current: billingUsage?.current_people ?? stats.total_members,
      limit: billingUsage?.person_limit,
      percent: peopleUsagePercent,
    },
    {
      key: "accounts",
      icon: "manage_accounts",
      label: t("manager.dashboard.usage.accounts"),
      current: billingUsage?.current_accounts ?? stats.total_accounts,
      limit: billingUsage?.account_limit,
      percent: accountUsagePercent,
    },
  ];

  const statCards = [
    {
      icon: "group",
      label: t("manager.dashboard.stats.members"),
      value: stats.total_members || 0,
      color: "#8b0000",
    },
    {
      icon: "manage_accounts",
      label: t("manager.dashboard.stats.accounts"),
      value: stats.total_accounts || 0,
      color: "#a94718",
    },
    {
      icon: "pending_actions",
      label: t("manager.dashboard.stats.pending"),
      value: totalPending,
      color: "#c99a2c",
    },
    {
      icon: "account_balance_wallet",
      label: t("manager.dashboard.stats.fund"),
      value: formatMoney(
        fundOverview?.balance ||
          fundOverview?.current_balance ||
          fundOverview?.total ||
          0
      ),
      color: "#2c5f2d",
    },
    {
      icon: "assignment",
      label: t("manager.dashboard.stats.tasks"),
      value: activeTasks,
      color: "#2c3e50",
    },
  ];

  return (
    <div className="manager-dashboard">
      <div className="welcome-banner section-card welcome-banner-compact">
  <div className="welcome-left">
    <span className="welcome-icon material-symbols-outlined">
      waving_hand
    </span>

    <div>
      <h2>
        {t("manager.dashboard.welcome", { name: currentUser?.name || currentUser?.display_name || "Manager" })}
      </h2>

      <p dangerouslySetInnerHTML={{ 
        __html: t("manager.dashboard.pendingSummary", { count: totalPending }) 
      }} />
    </div>
  </div>

  <button
    type="button"
    className="small-action-btn welcome-reload-btn"
    onClick={loadDashboard}
    disabled={loading}
  >
    <span className="material-symbols-outlined">refresh</span>
    {t("manager.accounts.actions.refresh")}
  </button>
</div>

      {error && <div className="section-card error-alert">{error}</div>}

      <div className="stats-grid-dashboard">
        {statCards.map((stat) => (
          <div
            key={stat.label}
            className="stat-card"
            style={{ borderLeftColor: stat.color }}
          >
            <div className="stat-icon" style={{ backgroundColor: stat.color }}>
              <span className="material-symbols-outlined">{stat.icon}</span>
            </div>

            <div className="stat-content">
              <h3>{loading ? "..." : stat.value}</h3>
              <p>{stat.label}</p>
            </div>
          </div>
        ))}
      </div>

      <section className={`section-card manager-usage-card ${isUsageWarning ? "is-warning" : ""}`}>
        <div className="manager-usage-head">
          <div>
            <span className="manager-usage-kicker">{t("manager.dashboard.usage.plan", { name: billingUsage?.plan_name || t("manager.dashboard.usage.noPlan") })}</span>
            <h2>{t("manager.dashboard.usage.title")}</h2>
            <p>{isUsageWarning ? t("manager.dashboard.usage.nearLimit") : t("manager.dashboard.usage.normal")}</p>
          </div>
          <span className={`manager-usage-badge ${isUsageWarning ? "is-warning" : ""}`}>
            <span className="material-symbols-outlined">monitoring</span>
            {isUsageWarning ? t("manager.dashboard.usage.nearLimit") : t("manager.dashboard.usage.normal")}
          </span>
        </div>

        <div className="manager-usage-chart-grid">
          {usageItems.map((item) => (
            <article key={item.key} className={`manager-usage-chart-card is-${getUsageTone(item.percent)}`}>
              <div className="manager-usage-chart-main">
                <div
                  className="manager-usage-donut"
                  style={{ "--usage-percent": `${item.percent}%` }}
                  role="img"
                  aria-label={`${item.label}: ${item.percent}%`}
                >
                  <span>{item.percent}%</span>
                </div>
                <div className="manager-usage-chart-copy">
                  <span className="material-symbols-outlined">{item.icon}</span>
                  <h3>{item.label}</h3>
                  <strong>{formatLimit(item.current, item.limit)}</strong>
                  <small>Còn lại: {getRemaining(item.current, item.limit)}</small>
                </div>
              </div>
              <div className="manager-usage-bar" aria-label={item.label}>
                <span style={{ width: `${item.percent}%` }} />
              </div>
            </article>
          ))}
        </div>
      </section>

      <ManagerDashboardCharts
        members={members}
        families={families}
        fundTransactions={fundTransactions}
        tasks={tasks}
        loading={loading}
      />
    </div>
  );
}
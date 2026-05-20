import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { getAdminDashboardStats } from "../../../api/adminService";
import {
    Area,
    AreaChart,
    Bar,
    BarChart,
    CartesianGrid,
    Cell,
    Legend,
    Line,
    LineChart,
    Pie,
    PieChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from "recharts";
import "./DashboardHome.css";

const formatNumber = (value, i18n) => 
    Number(value || 0).toLocaleString(i18n?.language === "vi" ? "vi-VN" : "en-US");

const PLAN_COLORS = ["#8f1717", "#d4af37", "#7c2d12", "#182236", "#b45309", "#991b1b"];

function percent(value) {
    const numeric = Number(value || 0);
    if (!Number.isFinite(numeric)) return "0%";
    return `${Math.round(numeric)}%`;
}

function ChartTooltip({ active, payload, label }) {
    if (!active || !payload?.length) return null;
    return (
        <div className="admin-chart-tooltip">
            <strong>{label}</strong>
            {payload.map((item) => (
                <span key={`${item.name}-${item.value}`}>
                    {item.name}: {formatNumber(item.value, item.i18n)}
                </span>
            ))}
        </div>
    );
}

function PlanTooltip({ active, payload, t }) {
    if (!active || !payload?.length) return null;
    const item = payload[0]?.payload || {};
    return (
        <div className="admin-chart-tooltip">
            <strong>{item.plan_name || t("admin.dashboard.plans.unknownPlan")}</strong>
            <span>{t("admin.dashboard.plans.clanCount", { count: item.total })}</span>
            <span>{percent(item.percent)} {t("admin.dashboard.plans.systemPercent")}</span>
        </div>
    );
}

export default function DashboardHome() {
    const { t, i18n } = useTranslation();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    useEffect(() => {
        const fetchData = async () => {
            try {
                setLoading(true);
                setError("");
                const statsRes = await getAdminDashboardStats();
                setData(statsRes);
            } catch (err) {
                setError(err.message || t("admin.dashboard.messages.loadError"));
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, []);

    const stats = data?.stats || {};
    const planDistribution = data?.plan_distribution || [];
    const topClans = data?.top_clans_by_members || [];
    const upgradeAlerts = data?.upgrade_alerts || [];
    const monthlyAccounts = data?.monthly_accounts || [];
    const monthlyClans = data?.monthly_clans || [];

    const totalPlanClans = useMemo(
        () => planDistribution.reduce((sum, item) => sum + Number(item.total || 0), 0),
        [planDistribution]
    );

    const statItems = [
        {
            icon: "account_tree",
            label: t("admin.dashboard.stats.totalClans"),
            value: stats.total_clans || 0,
            color: "var(--primary-gradient)",
            note: t("admin.dashboard.stats.totalClansNote"),
        },
        {
            icon: "groups",
            label: t("admin.dashboard.stats.totalMembers"),
            value: stats.total_members || 0,
            color: "var(--accent-gradient)",
            note: t("admin.dashboard.stats.totalMembersNote"),
        },
        {
            icon: "manage_accounts",
            label: t("admin.dashboard.stats.totalAccounts"),
            value: stats.total_accounts || 0,
            color: "linear-gradient(135deg, #7c2d12, #c2410c)",
            note: t("admin.dashboard.stats.totalAccountsNote"),
        },
        {
            icon: "event_available",
            label: t("admin.dashboard.stats.totalEvents"),
            value: stats.total_events || 0,
            color: "var(--warm-gradient)",
            note: t("admin.dashboard.stats.totalEventsNote"),
        },
        {
            icon: "perm_media",
            label: t("admin.dashboard.stats.totalMedia"),
            value: stats.total_media || 0,
            color: "var(--cool-gradient)",
            note: t("admin.dashboard.stats.totalMediaNote"),
        },
    ];

    if (loading && !data) {
        return <div className="loading-container"><div className="loader"></div><p>{t("admin.dashboard.messages.loading")}</p></div>;
    }

    return (
        <div className="premium-dashboard premium-dashboard-v2 admin-analytics-dashboard">
            <section className="dashboard-hero-panel">
                <div>
                    <span className="eyebrow">{t("admin.dashboard.title")}</span>
                    <h1>{t("admin.dashboard.overview")}</h1>
                    <p>{t("admin.dashboard.subtitle")}</p>
                </div>
                <div className="admin-only-pill">
                    <span className="material-symbols-outlined">admin_panel_settings</span>
                    {t("admin.dashboard.adminOnly")}
                </div>
            </section>

            {error && <div className="dashboard-error">{error}</div>}

            <div className={`stats-grid-premium ${loading ? "is-refreshing" : ""}`}>
                {statItems.map((item) => (
                    <div key={item.label} className="stat-card-glass stat-card-v2">
                        <div className="stat-icon-wrap" style={{ background: item.color }}>
                            <span className="material-symbols-outlined">{item.icon}</span>
                        </div>
                        <div className="stat-info">
                            <span className="label">{item.label}</span>
                            <h2 className="value">{formatNumber(item.value, i18n)}</h2>
                            <span className="trend">{item.note}</span>
                        </div>
                    </div>
                ))}
            </div>

            <section className="analytics-grid analytics-grid-two">
                <article className="card-glass chart-card">
                    <div className="card-header dashboard-card-header">
                        <div>
                            <span className="section-kicker">{t("admin.dashboard.plans.title")}</span>
                            <h2>{t("admin.dashboard.plans.subtitle")}</h2>
                        </div>
                        <span className="chart-badge">{t("admin.dashboard.plans.countLabel", { count: totalPlanClans })}</span>
                    </div>

                    <div className="donut-chart-layout">
                        <div className="donut-chart-box">
                            <ResponsiveContainer width="100%" height={280}>
                                <PieChart>
                                    <Pie
                                        data={planDistribution}
                                        dataKey="total"
                                        nameKey="plan_name"
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={72}
                                        outerRadius={108}
                                        paddingAngle={3}
                                    >
                                        {planDistribution.map((entry, index) => (
                                            <Cell key={entry.plan_name || index} fill={PLAN_COLORS[index % PLAN_COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <Tooltip content={<PlanTooltip t={t} />} />
                                </PieChart>
                            </ResponsiveContainer>
                            <div className="donut-center">
                                <strong>{formatNumber(totalPlanClans, i18n)}</strong>
                                <span>{t("admin.dashboard.plans.donutLabel")}</span>
                            </div>
                        </div>

                        <div className="plan-legend-list">
                            {planDistribution.map((item, index) => (
                                <div className="plan-legend-item" key={`${item.plan_name}-${index}`}>
                                    <span className="legend-dot" style={{ background: PLAN_COLORS[index % PLAN_COLORS.length] }} />
                                    <div>
                                        <strong>{item.plan_name || t("admin.dashboard.plans.unknownPlan")}</strong>
                                        <small>{t("admin.dashboard.plans.clanCount", { count: item.total })} · {percent(item.percent)}</small>
                                    </div>
                                </div>
                            ))}
                            {!planDistribution.length && <p className="empty-note">{t("admin.dashboard.plans.empty")}</p>}
                        </div>
                    </div>
                </article>

                <article className="card-glass chart-card">
                    <div className="card-header dashboard-card-header">
                        <div>
                            <span className="section-kicker">{t("admin.dashboard.topClans.title")}</span>
                            <h2>{t("admin.dashboard.topClans.subtitle")}</h2>
                        </div>
                        <span className="chart-badge">{t("admin.dashboard.topClans.badge", { count: 8 })}</span>
                    </div>

                    <div className="bar-chart-box">
                        <ResponsiveContainer width="100%" height={320}>
                            <BarChart data={topClans} layout="vertical" margin={{ top: 8, right: 28, bottom: 8, left: 16 }}>
                                <CartesianGrid strokeDasharray="4 8" horizontal={false} />
                                <XAxis type="number" allowDecimals={false} tick={{ fill: "#7c503c", fontWeight: 700 }} />
                                <YAxis
                                    type="category"
                                    dataKey="clan_name"
                                    width={120}
                                    tick={{ fill: "#2f211d", fontWeight: 800, fontSize: 12 }}
                                />
                                <Tooltip content={<ChartTooltip />} />
                                <Bar dataKey="member_count" name={t("admin.dashboard.topClans.memberCount")} radius={[0, 12, 12, 0]} fill="#8f1717" />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </article>
            </section>

            <section className="analytics-grid analytics-grid-two">
                <article className="card-glass chart-card">
                    <div className="card-header dashboard-card-header">
                        <div>
                            <span className="section-kicker">{t("admin.dashboard.growth.accountsTitle")}</span>
                            <h2>{t("admin.dashboard.growth.accountsSubtitle")}</h2>
                        </div>
                        <span className="chart-badge">{t("admin.dashboard.growth.last12Months")}</span>
                    </div>

                    <ResponsiveContainer width="100%" height={300}>
                        <LineChart data={monthlyAccounts} margin={{ top: 12, right: 18, bottom: 8, left: 0 }}>
                            <CartesianGrid strokeDasharray="4 8" />
                            <XAxis dataKey="label" tick={{ fill: "#7c503c", fontWeight: 700, fontSize: 12 }} />
                            <YAxis allowDecimals={false} tick={{ fill: "#7c503c", fontWeight: 700 }} />
                            <Tooltip content={<ChartTooltip />} />
                            <Legend />
                            <Line
                                type="monotone"
                                dataKey="total"
                                name={t("admin.dashboard.growth.newAccounts")}
                                stroke="#8f1717"
                                strokeWidth={3}
                                dot={{ r: 4, strokeWidth: 2 }}
                                activeDot={{ r: 6 }}
                            />
                        </LineChart>
                    </ResponsiveContainer>
                </article>

                <article className="card-glass chart-card">
                    <div className="card-header dashboard-card-header">
                        <div>
                            <span className="section-kicker">{t("admin.dashboard.growth.clansTitle")}</span>
                            <h2>{t("admin.dashboard.growth.clansSubtitle")}</h2>
                        </div>
                        <span className="chart-badge">{t("admin.dashboard.growth.last12Months")}</span>
                    </div>

                    <ResponsiveContainer width="100%" height={300}>
                        <AreaChart data={monthlyClans} margin={{ top: 12, right: 18, bottom: 8, left: 0 }}>
                            <defs>
                                <linearGradient id="clanAreaFill" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#d4af37" stopOpacity={0.44} />
                                    <stop offset="95%" stopColor="#d4af37" stopOpacity={0.04} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="4 8" />
                            <XAxis dataKey="label" tick={{ fill: "#7c503c", fontWeight: 700, fontSize: 12 }} />
                            <YAxis allowDecimals={false} tick={{ fill: "#7c503c", fontWeight: 700 }} />
                            <Tooltip content={<ChartTooltip />} />
                            <Legend />
                            <Area
                                type="monotone"
                                dataKey="total"
                                name={t("admin.dashboard.growth.newClans")}
                                stroke="#a87310"
                                strokeWidth={3}
                                fill="url(#clanAreaFill)"
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                </article>
            </section>

            <section className="card-glass upgrade-alert-card">
                <div className="card-header dashboard-card-header">
                    <div>
                        <span className="section-kicker">{t("admin.dashboard.upgrades.title")}</span>
                        <h2>{t("admin.dashboard.upgrades.subtitle")}</h2>
                    </div>
                    <span className="chart-badge">{t("admin.dashboard.upgrades.alertCount", { count: upgradeAlerts.length })}</span>
                </div>

                {upgradeAlerts.length ? (
                    <div className="upgrade-alert-list">
                        {upgradeAlerts.map((item) => (
                            <article className={`upgrade-alert-row ${Number(item.max_usage_percent) >= 100 ? "is-danger" : "is-warning"}`} key={item.clan_id}>
                                <div className="upgrade-clan-main">
                                    <span className="material-symbols-outlined">warning</span>
                                    <div>
                                        <strong>{item.clan_name}</strong>
                                        <small>{t("admin.dashboard.upgrades.currentPlan", { name: item.plan_name || t("admin.dashboard.upgrades.noPlan") })}</small>
                                    </div>
                                </div>

                                <div className="upgrade-meter-group">
                                    <div className="upgrade-meter">
                                        <div className="upgrade-meter-label">
                                            <span>{t("admin.dashboard.upgrades.people")}</span>
                                            <b>{formatNumber(item.current_people, i18n)} / {formatNumber(item.person_limit, i18n)}</b>
                                        </div>
                                        <div className="upgrade-progress">
                                            <span style={{ width: `${Math.min(100, Number(item.people_usage_percent || 0))}%` }} />
                                        </div>
                                    </div>

                                    <div className="upgrade-meter">
                                        <div className="upgrade-meter-label">
                                            <span>{t("admin.dashboard.upgrades.accounts")}</span>
                                            <b>{formatNumber(item.current_accounts, i18n)} / {formatNumber(item.account_limit, i18n)}</b>
                                        </div>
                                        <div className="upgrade-progress">
                                            <span style={{ width: `${Math.min(100, Number(item.account_usage_percent || 0))}%` }} />
                                        </div>
                                    </div>
                                </div>

                                <div className="upgrade-status-pill">
                                    {Number(item.max_usage_percent) >= 100 
                                        ? t("admin.dashboard.upgrades.exceeded") 
                                        : t("admin.dashboard.upgrades.usage", { percent: percent(item.max_usage_percent) })}
                                </div>
                            </article>
                        ))}
                    </div>
                ) : (
                    <div className="empty-alert-state">
                        <span className="material-symbols-outlined">verified</span>
                        <div>
                            <strong>{t("admin.dashboard.upgrades.emptyTitle")}</strong>
                            <p>{t("admin.dashboard.upgrades.emptySubtitle")}</p>
                        </div>
                    </div>
                )}
            </section>
        </div>
    );
}

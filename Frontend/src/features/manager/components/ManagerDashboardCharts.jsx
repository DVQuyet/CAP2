import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";

const GENDER_COLORS = {
  male: "#8b0000",
  female: "#ff69b4",
  unknown: "#c99a2c",
};

const FINANCE_COLORS = {
  income: "#0f766e",
  expense: "#dc2626",
};

const FAMILY_COLOR = "#d4a62a";

const formatMoney = (value, language = "vi") =>
  new Intl.NumberFormat(language?.startsWith("vi") ? "vi-VN" : "en-US", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));

const formatShortMoney = (value, t) => {
  const number = Number(value || 0);

  if (number >= 1000000) {
    return `${(number / 1000000).toFixed(number % 1000000 === 0 ? 0 : 1)}${t("manager.dashboard.charts.money.millionShort")}`;
  }

  if (number >= 1000) {
    return `${Math.round(number / 1000)}${t("manager.dashboard.charts.money.thousandShort")}`;
  }

  return `${number}`;
};

const normalizeGender = (gender) => {
  const value = String(gender ?? "").trim().toLowerCase();

  if (value === "1" || value === "male" || value === "nam") {
    return "male";
  }

  if (value === "2" || value === "female" || value === "nữ" || value === "nu") {
    return "female";
  }

  return "unknown";
};

const getQuarterFromDate = (dateValue) => {
  const date = new Date(dateValue);

  if (Number.isNaN(date.getTime())) {
    return {
      key: "unknown",
      year: 0,
      quarter: 0,
    };
  }

  const month = date.getMonth() + 1;
  const quarter = Math.ceil(month / 3);
  const year = date.getFullYear();

  return {
    key: `${year}-Q${quarter}`,
    year,
    quarter,
  };
};

const formatQuarterLabel = (item, t) =>
  item?.quarterNumber
    ? t("manager.dashboard.charts.quarterLabel", {
        quarter: item.quarterNumber,
        year: item.year,
      })
    : t("manager.dashboard.charts.unknownQuarter");

const buildGenderData = (members = []) => {
  const map = new Map();

  members.forEach((member) => {
    const gender = normalizeGender(member.gender);
    map.set(gender, (map.get(gender) || 0) + 1);
  });

  return Array.from(map.entries()).map(([name, value]) => ({
    name,
    value,
  }));
};

const getFamilyDate = (family) =>
  family?.created_at ||
  family?.createdAt ||
  family?.marriage_date ||
  family?.marriageDate ||
  family?.updated_at ||
  family?.updatedAt ||
  family?.date;

const getCurrentQuarterInfo = () => getQuarterFromDate(new Date());

const normalizeId = (value) => {
  const id = Number(value);
  return Number.isFinite(id) && id > 0 ? id : null;
};

const isMaleMember = (member) => normalizeGender(member?.gender) === "male";

const buildFamilyQuarterData = (families = [], members = []) => {
  const map = new Map();

  const memberById = new Map(
    members
      .map((member) => [normalizeId(member.id), member])
      .filter(([id]) => id !== null)
  );

  const addFamilyToQuarter = (dateValue) => {
    const quarterInfo = dateValue ? getQuarterFromDate(dateValue) : getCurrentQuarterInfo();

    const current = map.get(quarterInfo.key) || {
      total: 0,
      year: quarterInfo.year,
      quarterNumber: quarterInfo.quarter,
    };

    current.total += 1;
    map.set(quarterInfo.key, current);
  };

  if (families.length > 0) {
    families.forEach((family) => {
      const fatherId = normalizeId(family.father_id || family.fatherId);
      const motherId = normalizeId(family.mother_id || family.motherId);

      if (!fatherId || !motherId) return;

      const father = memberById.get(fatherId);
      if (father && !isMaleMember(father)) return;

      addFamilyToQuarter(getFamilyDate(family));
    });
  } else {
    const spousePairs = new Set();

    members.forEach((member) => {
      const memberId = normalizeId(member.id);
      const spouseId = normalizeId(
        member.spouse_id ||
          member.spouseId ||
          member.wife_id ||
          member.wifeId ||
          member.husband_id ||
          member.husbandId
      );

      if (!memberId || !spouseId || !isMaleMember(member)) return;

      const key = [memberId, spouseId].sort((a, b) => a - b).join(":");
      if (spousePairs.has(key)) return;

      spousePairs.add(key);

      addFamilyToQuarter(
        member.marriage_date ||
          member.marriageDate ||
          member.created_at ||
          member.createdAt ||
          member.updated_at ||
          member.updatedAt
      );
    });
  }

  return Array.from(map.values()).sort((a, b) => {
    if (a.year !== b.year) return a.year - b.year;
    return a.quarterNumber - b.quarterNumber;
  });
};

const buildQuarterFinanceData = (transactions = []) => {
  const map = new Map();

  transactions.forEach((tx) => {
    const quarterInfo = getQuarterFromDate(tx.date || tx.created_at);

    const current = map.get(quarterInfo.key) || {
      income: 0,
      expense: 0,
      balance: 0,
      year: quarterInfo.year,
      quarterNumber: quarterInfo.quarter,
    };

    const amount = Number(tx.amount || 0);

    if (tx.type === "income") {
      current.income += amount;
    }

    if (tx.type === "expense") {
      current.expense += amount;
    }

    current.balance = current.income - current.expense;
    map.set(quarterInfo.key, current);
  });

  return Array.from(map.values()).sort((a, b) => {
    if (a.year !== b.year) return a.year - b.year;
    return a.quarterNumber - b.quarterNumber;
  });
};

export default function ManagerDashboardCharts({
  members = [],
  families = [],
  fundTransactions = [],
  tasks = [],
  loading = false,
}) {
  const { t, i18n } = useTranslation();
  const genderData = useMemo(() => buildGenderData(members), [members]);

  const familyQuarterData = useMemo(
    () => buildFamilyQuarterData(families, members),
    [families, members]
  );

  const financeQuarterData = useMemo(
    () => buildQuarterFinanceData(fundTransactions),
    [fundTransactions]
  );

  const localizedFamilyQuarterData = useMemo(
    () =>
      familyQuarterData.map((item) => ({
        ...item,
        quarterLabel: formatQuarterLabel(item, t),
      })),
    [familyQuarterData, t]
  );

  const localizedFinanceQuarterData = useMemo(
    () =>
      financeQuarterData.map((item) => ({
        ...item,
        quarterLabel: formatQuarterLabel(item, t),
      })),
    [financeQuarterData, t]
  );

  const totalMembersWithGender = genderData.reduce((sum, item) => sum + item.value, 0);
  const genderLabel = (name) => t(`manager.dashboard.charts.gender.${name}`);
  const taskStatusLabel = (status) => t(`manager.dashboard.charts.taskStatus.${String(status || "unknown").toLowerCase()}`, { defaultValue: String(status || "") });

  if (loading) {
    return (
      <div className="dashboard-chart-area dashboard-chart-area-clean">
        <div className="section-card chart-card chart-empty">
          {t("manager.dashboard.charts.loading")}
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-chart-area dashboard-chart-area-clean">
      <div className="section-card chart-card gender-chart-card">
        <div className="chart-title-row">
          <div>
            <h2>{t("manager.dashboard.charts.genderTitle")}</h2>
            <p>{t("manager.dashboard.charts.genderSubtitle")}</p>
          </div>
        </div>

        {genderData.length === 0 ? (
          <div className="chart-empty">{t("manager.dashboard.charts.emptyGender")}</div>
        ) : (
          <div className="gender-chart-layout">
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={genderData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={54}
                  outerRadius={82}
                  paddingAngle={5}
                >
                  {genderData.map((entry) => (
                    <Cell key={entry.name} fill={GENDER_COLORS[entry.name] || "#c99a2c"} />
                  ))}
                </Pie>

                <Tooltip
                  formatter={(value, name) => {
                    const percent = totalMembersWithGender
                      ? ((Number(value) / totalMembersWithGender) * 100).toFixed(1)
                      : 0;

                    return [
                      t("manager.dashboard.charts.peoplePercent", { count: value, percent }),
                      genderLabel(name),
                    ];
                  }}
                />

                <Legend formatter={(value) => genderLabel(value)} />
              </PieChart>
            </ResponsiveContainer>

            <div className="gender-summary">
              {genderData.map((item) => {
                const percent = totalMembersWithGender
                  ? ((item.value / totalMembersWithGender) * 100).toFixed(1)
                  : 0;

                return (
                  <div className="gender-summary-item" key={item.name}>
                    <span style={{ backgroundColor: GENDER_COLORS[item.name] || "#c99a2c" }} />

                    <div>
                      <strong>{item.value}</strong>
                      <p>{genderLabel(item.name)} - {percent}%</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div className="section-card chart-card family-chart-card">
        <div className="chart-title-row">
          <div>
            <h2>{t("manager.dashboard.charts.familyTitle")}</h2>
            <p>{t("manager.dashboard.charts.familySubtitle")}</p>
          </div>

          <span className="chart-badge">{t("manager.dashboard.charts.threeMonths")}</span>
        </div>

        {localizedFamilyQuarterData.length === 0 ? (
          <div className="chart-empty">{t("manager.dashboard.charts.emptyFamily")}</div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={localizedFamilyQuarterData} margin={{ top: 20, right: 20, left: 0, bottom: 10 }} barCategoryGap="28%">
              <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#eadfce" />

              <XAxis dataKey="quarterLabel" axisLine={false} tickLine={false} tick={{ fill: "#7a684f", fontSize: 14, fontWeight: 600 }} />

              <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: "#7a684f", fontSize: 14 }} />

              <Tooltip
                formatter={(value) => [t("manager.dashboard.charts.familyCount", { count: value }), t("manager.dashboard.charts.quantity")]}
                contentStyle={{
                  borderRadius: "12px",
                  border: "1px solid #ecd9bc",
                  background: "#fffaf3",
                }}
              />

              <Bar dataKey="total" name={t("manager.dashboard.charts.familyCountName")} fill={FAMILY_COLOR} radius={[12, 12, 0, 0]} maxBarSize={68} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="section-card chart-card finance-quarter-card">
        <div className="chart-title-row">
          <div>
            <h2>{t("manager.dashboard.charts.financeTitle")}</h2>
            <p>{t("manager.dashboard.charts.financeSubtitle")}</p>
          </div>
        </div>

        {localizedFinanceQuarterData.length === 0 ? (
          <div className="chart-empty">{t("manager.dashboard.charts.emptyFinance")}</div>
        ) : (
          <ResponsiveContainer width="100%" height={215}>
            <BarChart data={localizedFinanceQuarterData} margin={{ top: 20, right: 24, left: 10, bottom: 10 }} barGap={10} barCategoryGap="30%">
              <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#eadfce" />

              <XAxis dataKey="quarterLabel" axisLine={false} tickLine={false} tick={{ fill: "#7a684f", fontSize: 14, fontWeight: 600 }} />

              <YAxis axisLine={false} tickLine={false} tick={{ fill: "#7a684f", fontSize: 14 }} tickFormatter={(value) => formatShortMoney(value, t)} />

              <Tooltip
                formatter={(value, name) => [formatMoney(value, i18n.language), name]}
                contentStyle={{
                  borderRadius: "12px",
                  border: "1px solid #ecd9bc",
                  background: "#fffaf3",
                }}
              />

              <Legend wrapperStyle={{ paddingTop: 14, fontWeight: 700 }} iconType="circle" />

              <Bar dataKey="income" name={t("manager.dashboard.charts.income")} fill={FINANCE_COLORS.income} radius={[10, 10, 0, 0]} maxBarSize={54} />

              <Bar dataKey="expense" name={t("manager.dashboard.charts.expense")} fill={FINANCE_COLORS.expense} radius={[10, 10, 0, 0]} maxBarSize={54} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="section-card chart-card manager-task-card">
        <div className="chart-title-row">
          <div>
            <h2>{t("manager.dashboard.charts.tasksTitle")}</h2>
            <p>{t("manager.dashboard.charts.tasksSubtitle")}</p>
          </div>
        </div>

        <div className="quick-stats manager-task-list">
          {tasks.slice(0, 5).map((task) => (
            <div className="quick-stat-item" key={task.id}>
              <span>{task.title}</span>
              <strong className={`status-badge ${task.status}`}>
                {taskStatusLabel(task.status)}
              </strong>
            </div>
          ))}

          {!loading && tasks.length === 0 && (
            <div className="activity-item">{t("manager.dashboard.charts.emptyTasks")}</div>
          )}
        </div>
      </div>
    </div>
  );
}

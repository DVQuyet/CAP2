import { useState } from "react";
import { useTranslation } from "react-i18next";
import { generateFundSummaryAI } from "../../../api/aiServerService";
import "./FundAISummary.css";

const formatMoney = (value) => `${new Intl.NumberFormat("vi-VN").format(Number(value) || 0)} ₫`;

// "AI tóm tắt": server tự tính số liệu theo kỳ rồi nhờ AI diễn đạt; ở đây hiện lời tóm tắt kèm đúng các số đã dùng.
export default function FundAISummary() {
  const { t } = useTranslation();
  const [period, setPeriod] = useState("month");
  const [custom, setCustom] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  const rangeInvalid = custom && (!from || !to || from > to);

  const run = async () => {
    if (loading || rangeInvalid) return;
    setLoading(true);
    setError("");
    try {
      const data = await generateFundSummaryAI({ period, ...(custom ? { from, to } : {}) });
      setResult(data);
    } catch (err) {
      setResult(null);
      if (err?.status === 503) setError(t("fund.analytics.ai.unavailable"));
      else setError(err?.message || t("fund.analytics.ai.error"));
    } finally {
      setLoading(false);
    }
  };

  const n = result?.numbers;
  return (
    <section className="fund-ai glass-card" aria-label={t("fund.analytics.ai.title")}>
      <div className="fund-ai-head">
        <h3>
          <span className="material-symbols-outlined" aria-hidden="true">auto_awesome</span>
          {t("fund.analytics.ai.title")}
        </h3>
        <p>{t("fund.analytics.ai.hint")}</p>
      </div>
      <div className="fund-ai-controls">
        <label>
          {t("fund.analytics.ai.periodLabel")}
          <select value={period} onChange={(event) => setPeriod(event.target.value)} disabled={loading}>
            <option value="month">{t("fund.analytics.ai.period.month")}</option>
            <option value="quarter">{t("fund.analytics.ai.period.quarter")}</option>
            <option value="year">{t("fund.analytics.ai.period.year")}</option>
          </select>
        </label>
        <label className="fund-ai-check">
          <input type="checkbox" checked={custom} onChange={(event) => setCustom(event.target.checked)} disabled={loading} />
          {t("fund.analytics.ai.customRange")}
        </label>
        {custom ? (
          <div className="fund-ai-range">
            <label>
              {t("fund.analytics.ai.from")}
              <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} disabled={loading} />
            </label>
            <label>
              {t("fund.analytics.ai.to")}
              <input type="date" value={to} onChange={(event) => setTo(event.target.value)} disabled={loading} />
            </label>
          </div>
        ) : null}
        <button type="button" className="fund-ai-run" onClick={run} disabled={loading || rangeInvalid}>
          {loading ? t("fund.analytics.ai.loading") : t("fund.analytics.ai.run")}
        </button>
      </div>
      {rangeInvalid ? <div className="fund-ai-error" role="alert">{t("fund.analytics.ai.rangeInvalid")}</div> : null}
      {error ? <div className="fund-ai-error" role="alert">{error}</div> : null}
      {result ? (
        <div className="fund-ai-result" role="status">
          <p className="fund-ai-summary">{result.summary}</p>
          {result.unverified?.length ? (
            <div className="fund-ai-warning">{t("fund.analytics.ai.unverified", { items: result.unverified.join(", ") })}</div>
          ) : null}
          {n ? (
            <details className="fund-ai-numbers" open>
              <summary>{t("fund.analytics.ai.numbersTitle", { label: n.label })}</summary>
              <dl>
                <div><dt>{t("fund.analytics.ai.n.income")}</dt><dd>{formatMoney(n.total_income)} ({n.income_count})</dd></div>
                <div><dt>{t("fund.analytics.ai.n.expense")}</dt><dd>{formatMoney(n.total_expense)} ({n.expense_count})</dd></div>
                <div><dt>{t("fund.analytics.ai.n.net")}</dt><dd>{formatMoney(n.net_change)}</dd></div>
                <div><dt>{t("fund.analytics.ai.n.opening")}</dt><dd>{formatMoney(n.opening_balance)}</dd></div>
                <div><dt>{t("fund.analytics.ai.n.closing")}</dt><dd>{formatMoney(n.closing_balance)}</dd></div>
                <div><dt>{t("fund.analytics.ai.n.contributors")}</dt><dd>{n.contributor_count}</dd></div>
                <div>
                  <dt>{t("fund.analytics.ai.n.large", { amount: formatMoney(n.large_threshold) })}</dt>
                  <dd>{t("fund.analytics.ai.n.largeValue", { income: n.large_income_count, expense: n.large_expense_count })}</dd>
                </div>
              </dl>
              {n.top_expense_categories?.length ? (
                <div className="fund-ai-top">
                  <strong>{t("fund.analytics.ai.n.topExpense")}</strong>
                  <ol>{n.top_expense_categories.map((item) => <li key={item.name}>{item.name}: {formatMoney(item.total)}</li>)}</ol>
                </div>
              ) : null}
              {n.top_income_sources?.length ? (
                <div className="fund-ai-top">
                  <strong>{t("fund.analytics.ai.n.topIncome")}</strong>
                  <ol>{n.top_income_sources.map((item) => <li key={item.name}>{item.name}: {formatMoney(item.total)}</li>)}</ol>
                </div>
              ) : null}
            </details>
          ) : null}
          <small className="fund-ai-note">{t("fund.analytics.ai.note")}</small>
        </div>
      ) : null}
    </section>
  );
}

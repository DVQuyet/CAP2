import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { dismissDuplicatePair, getDuplicateCandidates } from "../../../api/managerService";
import LoadingState from "../../../shared/components/LoadingState";
import EmptyState from "../../../shared/components/EmptyState";
import ErrorState from "../../../shared/components/ErrorState";
import { friendlyErrorMessage } from "../../../shared/utils/friendlyError";
import { useConfirm } from "../../../shared/components/confirmContext.js";
import { buildTreeFocusUrl } from "../../genealogy/utils/treeFocusParams";
import { buildCompareRows, normalizeReasons, removePairByKey } from "../duplicateHelpers";
import "./DuplicatesPage.css";

const PAGE_SIZE = 20;

function PairCard({ pair, onDismiss, busy, t }) {
  const rows = buildCompareRows(pair.a, pair.b);
  const reasons = normalizeReasons(pair.reasons);
  const genderText = (value) => (value === 1 ? t("duplicates.gender.male") : value === 2 ? t("duplicates.gender.female") : null);
  const show = (field, value) => (field === "gender" ? genderText(value) : value) ?? t("duplicates.unknown");
  return (
    <article className="dup-card">
      <header className="dup-cardHead">
        <span className={`dup-score is-${pair.confidence}`}>{t("duplicates.score", { score: pair.score })} · {t(`duplicates.confidence.${pair.confidence}`)}</span>
        <ul className="dup-reasons">
          {reasons.map((reason) => (
            <li key={reason.code} className={reason.negative ? "is-negative" : ""}>
              {t(`duplicates.reason.${reason.code}`)} ({reason.points > 0 ? "+" : ""}{reason.points})
            </li>
          ))}
        </ul>
      </header>
      <div className="dup-compare" role="table">
        <div className="dup-row dup-rowHead" role="row">
          <span />
          <strong>{pair.a.name}</strong>
          <strong>{pair.b.name}</strong>
        </div>
        {rows.map((row) => (
          <div key={row.field} className={`dup-row ${row.differs ? "is-diff" : ""}`} role="row">
            <span className="dup-label">{t(`duplicates.field.${row.field}`)}</span>
            <span>{show(row.field, row.left)}</span>
            <span>{show(row.field, row.right)}</span>
          </div>
        ))}
      </div>
      <footer className="dup-actions">
        <Link className="mgr-btnGhost" to={buildTreeFocusUrl("manager", [pair.a.id])}>{t("duplicates.openProfile", { name: pair.a.name })}</Link>
        <Link className="mgr-btnGhost" to={buildTreeFocusUrl("manager", [pair.b.id])}>{t("duplicates.openProfile", { name: pair.b.name })}</Link>
        <button type="button" className="mgr-btnGhost" onClick={() => onDismiss(pair)} disabled={busy}>{t("duplicates.notDuplicate")}</button>
      </footer>
    </article>
  );
}

// Trang quản lý: danh sách cặp có thể trùng, so sánh cạnh nhau. Không tự gộp.
export default function DuplicatesPage() {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const [pairs, setPairs] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [actionError, setActionError] = useState("");
  const [busyKey, setBusyKey] = useState("");

  const [reloadKey, setReloadKey] = useState(0);
  const load = useCallback(() => {
    setLoading(true);
    setLoadError(null);
    setReloadKey((key) => key + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    getDuplicateCandidates({ limit: PAGE_SIZE, offset: 0 })
      .then((data) => {
        if (cancelled) return;
        setPairs(data.pairs || []);
        setTotal(Number(data.total) || 0);
      })
      .catch((err) => { if (!cancelled) setLoadError(err || new Error("load failed")); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [reloadKey]);

  const loadMore = async () => {
    setLoadingMore(true);
    setActionError("");
    try {
      const data = await getDuplicateCandidates({ limit: PAGE_SIZE, offset: pairs.length });
      setPairs((current) => [...current, ...(data.pairs || []).filter((p) => !current.some((c) => c.key === p.key))]);
      setTotal(Number(data.total) || 0);
    } catch (err) {
      setActionError(friendlyErrorMessage(err, t));
    } finally {
      setLoadingMore(false);
    }
  };

  const dismiss = async (pair) => {
    const ok = await confirm({ message: t("duplicates.confirmDismiss", { a: pair.a.name, b: pair.b.name }), confirmText: t("duplicates.notDuplicate") });
    if (!ok) return;
    setBusyKey(pair.key);
    setActionError("");
    try {
      await dismissDuplicatePair(pair.a.id, pair.b.id);
      setPairs((current) => removePairByKey(current, pair.key));
      setTotal((value) => Math.max(0, value - 1));
    } catch (err) {
      setActionError(friendlyErrorMessage(err, t));
    } finally {
      setBusyKey("");
    }
  };

  return (
    <div className="dup-page">
      <header className="dup-head">
        <div>
          <h1>{t("duplicates.title")}</h1>
          <p>{t("duplicates.intro")}</p>
        </div>
        <Link className="mgr-btnGhost" to="/manager/genealogy">{t("duplicates.backToTree")}</Link>
      </header>
      {actionError ? <div className="dup-error" role="alert">{actionError}</div> : null}
      {loading ? <LoadingState variant="rows" /> : null}
      {!loading && loadError ? <ErrorState error={loadError} onRetry={load} /> : null}
      {!loading && !loadError && !pairs.length ? <EmptyState icon="task_alt" title={t("duplicates.emptyTitle")} hint={t("duplicates.emptyHint")} /> : null}
      {!loading && !loadError && pairs.length ? (
        <>
          <p className="dup-count">{t("duplicates.count", { shown: pairs.length, total })}</p>
          {pairs.map((pair) => <PairCard key={pair.key} pair={pair} onDismiss={dismiss} busy={busyKey === pair.key} t={t} />)}
          {pairs.length < total ? (
            <button type="button" className="mgr-btnGhost dup-more" onClick={loadMore} disabled={loadingMore}>
              {loadingMore ? t("common.loading") : t("duplicates.loadMore")}
            </button>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { getMemberDashboard } from "../../../api/memberService";
import { getManagerTree } from "../../../api/managerService";
import LoadingState from "../../../shared/components/LoadingState";
import EmptyState from "../../../shared/components/EmptyState";
import ErrorState from "../../../shared/components/ErrorState";
import { friendlyErrorMessage } from "../../../shared/utils/friendlyError";
import { branchRootOptions, buildBook } from "../bookModel";
import "./GenealogyBookPage.css";

// Sổ gia phả: trang đọc/in (Ctrl+P hoặc nút In / Lưu PDF). Dùng cùng API với trang cây của từng vai trò.
export default function GenealogyBookPage({ role = "member" }) {
  const { t } = useTranslation();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [rootId, setRootId] = useState("");
  const [livingOnly, setLivingOnly] = useState(false);

  const treePath = role === "manager" ? "/manager/genealogy" : "/user/family-tree";

  const [reloadKey, setReloadKey] = useState(0);

  const load = useCallback(() => {
    setLoading(true);
    setReloadKey((key) => key + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (role === "manager" ? getManagerTree() : getMemberDashboard())
      .then((response) => {
        if (cancelled) return;
        setData(response);
        setLoadError(null);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err || new Error("load failed"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [role, reloadKey]);

  // Ẩn khung ứng dụng khi in (CSS chỉ áp dụng khi body có lớp này).
  useEffect(() => {
    document.body.classList.add("gb-printing");
    return () => document.body.classList.remove("gb-printing");
  }, []);

  const people = useMemo(() => (Array.isArray(data?.treeMembers) ? data.treeMembers : []), [data]);
  const families = useMemo(() => (Array.isArray(data?.families) ? data.families : []), [data]);
  const children = useMemo(() => (Array.isArray(data?.children) ? data.children : []), [data]);
  const clanName = data?.clan?.clan_name || t("genealogyBook.defaultClan");

  const roots = useMemo(() => branchRootOptions(people, families, children), [people, families, children]);
  const book = useMemo(
    () => buildBook({ people, families, children }, { rootId, livingOnly }),
    [people, families, children, rootId, livingOnly],
  );

  const generatedAt = new Date().toLocaleDateString("vi-VN");
  const genderLabel = (key) => t(`genealogyBook.gender.${key}`);

  if (loading) {
    return (
      <div className="gb-page">
        <LoadingState variant="block" label={t("genealogyBook.loading")} />
      </div>
    );
  }
  if (loadError && !data) {
    return (
      <div className="gb-page">
        <ErrorState message={friendlyErrorMessage(loadError, t)} error={loadError} onRetry={load} />
      </div>
    );
  }

  return (
    <div className="gb-page">
      <div className="gb-toolbar" role="toolbar" aria-label={t("genealogyBook.toolbar")}>
        <Link className="gb-btn" to={treePath}>
          <span className="material-symbols-outlined" aria-hidden="true">arrow_back</span>
          {t("genealogyBook.backToTree")}
        </Link>
        <label className="gb-field">
          <span>{t("genealogyBook.branchFilter")}</span>
          <select value={rootId} onChange={(event) => setRootId(event.target.value)}>
            <option value="">{t("genealogyBook.allBranches")}</option>
            {roots.map((option) => (
              <option key={option.id} value={option.id}>
                {t("genealogyBook.optionLabel", { name: option.name, generation: option.generation })}
              </option>
            ))}
          </select>
        </label>
        <label className="gb-check">
          <input type="checkbox" checked={livingOnly} onChange={(event) => setLivingOnly(event.target.checked)} />
          {t("genealogyBook.livingOnly")}
        </label>
        <button type="button" className="gb-btn gb-btn-primary" onClick={() => window.print()}>
          <span className="material-symbols-outlined" aria-hidden="true">print</span>
          {t("genealogyBook.print")}
        </button>
      </div>

      {people.length === 0 ? (
        <EmptyState icon="menu_book" title={t("genealogyBook.emptyTitle")} hint={t("genealogyBook.emptyHint")} />
      ) : (
        <article className="gb-book">
          <section className="gb-cover">
            <p className="gb-cover-kicker">{t("genealogyBook.title")}</p>
            <h1>{clanName}</h1>
            <p className="gb-cover-date">{t("genealogyBook.generatedOn", { date: generatedAt })}</p>
            <dl className="gb-stats">
              <div><dt>{t("genealogyBook.stats.people")}</dt><dd>{book.stats.people}</dd></div>
              <div><dt>{t("genealogyBook.stats.generations")}</dt><dd>{book.stats.generations}</dd></div>
              <div><dt>{t("genealogyBook.stats.living")}</dt><dd>{book.stats.living}</dd></div>
              <div><dt>{t("genealogyBook.stats.deceased")}</dt><dd>{book.stats.deceased}</dd></div>
            </dl>
          </section>

          {book.generations.length === 0 ? (
            <EmptyState icon="filter_alt_off" title={t("genealogyBook.noMatch")} />
          ) : (
            book.generations.map((group) => (
              <section className="gb-generation" key={group.generation}>
                <h2>{t("genealogyBook.generation", { generation: group.generation })}</h2>
                <div className="gb-people">
                  {group.people.map((person) => (
                    <div className="gb-person" key={person.id}>
                      <h3>
                        {person.name}
                        <small>{genderLabel(person.gender)}</small>
                      </h3>
                      <dl>
                        <div>
                          <dt>{t("genealogyBook.born")}</dt>
                          <dd>{person.birth || t("genealogyBook.unknown")}</dd>
                        </div>
                        <div>
                          <dt>{t("genealogyBook.died")}</dt>
                          <dd>
                            {person.status === "living"
                              ? t("genealogyBook.stillLiving")
                              : person.death || (person.status === "deceased" ? t("genealogyBook.deceasedNoDate") : t("genealogyBook.unknown"))}
                          </dd>
                        </div>
                        {person.anniversary ? (
                          <div>
                            <dt>{t("genealogyBook.anniversary")}</dt>
                            <dd>{t("genealogyBook.lunarDate", { date: person.anniversary })}</dd>
                          </div>
                        ) : null}
                        {person.spouses.length ? (
                          <div><dt>{t("genealogyBook.spouses")}</dt><dd>{person.spouses.join(", ")}</dd></div>
                        ) : null}
                        {person.parents.length ? (
                          <div><dt>{t("genealogyBook.parents")}</dt><dd>{person.parents.join(", ")}</dd></div>
                        ) : null}
                        {person.children.length ? (
                          <div><dt>{t("genealogyBook.children")}</dt><dd>{person.children.join(", ")}</dd></div>
                        ) : null}
                      </dl>
                    </div>
                  ))}
                </div>
              </section>
            ))
          )}

          {book.index.length ? (
            <section className="gb-generation gb-index">
              <h2>{t("genealogyBook.index")}</h2>
              <ol>
                {book.index.map((entry) => (
                  <li key={entry.id}>
                    <span>{entry.name}</span>
                    <em>{t("genealogyBook.generation", { generation: entry.generation })}</em>
                  </li>
                ))}
              </ol>
            </section>
          ) : null}
        </article>
      )}
    </div>
  );
}

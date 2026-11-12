import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { fetchPublicNewsItem } from "../../../api/landingService";
import { paragraphsOf } from "../landing/landingContent";
import LoadingState from "../../../shared/components/LoadingState";
import ErrorState from "../../../shared/components/ErrorState";
import EmptyState from "../../../shared/components/EmptyState";
import "./NewsArticlePage.css";

export default function NewsArticlePage() {
  const { id } = useParams();
  const { t, i18n } = useTranslation();
  const lang = String(i18n.resolvedLanguage || i18n.language || "vi").startsWith("en") ? "en" : "vi";
  const [loaded, setLoaded] = useState({ key: "", result: null });
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  const requestKey = `${id}|${lang}|${attempt}`;
  const state = loaded.key === requestKey && loaded.result ? loaded.result : { status: "loading" };

  useEffect(() => {
    let cancelled = false;
    fetchPublicNewsItem(id, lang).then((result) => {
      if (!cancelled) setLoaded({ key: requestKey, result });
    });
    return () => {
      cancelled = true;
    };
  }, [id, lang, requestKey]);

  const item = state.status === "ok" ? state.item : null;
  useEffect(() => {
    if (!item || !item.title) return undefined;
    const previous = document.title;
    document.title = item.title;
    return () => {
      document.title = previous;
    };
  }, [item]);

  let body;
  if (state.status === "loading") {
    body = <LoadingState variant="block" />;
  } else if (state.status === "notfound") {
    body = <EmptyState icon="search_off" title={t("public.news.article.notFound")} hint={t("public.news.article.notFoundHint")} />;
  } else if (state.status === "error") {
    body = <ErrorState message={t("public.news.article.error")} onRetry={retry} />;
  } else {
    body = (
      <article className="news-article">
        {item.meta && <span className="news-article-date">{item.meta}</span>}
        <h1>{item.title}</h1>
        {item.image_url && <img className="news-article-image" src={item.image_url} alt={item.title} />}
        <div className="news-article-content">
          {paragraphsOf(item.content || item.body).map((line, index) => (
            <p key={index}>{line}</p>
          ))}
        </div>
      </article>
    );
  }

  return (
    <section className="news-article-page">
      <div className="container news-article-container">
        <Link className="news-article-back" to="/tin-tuc">
          <span className="material-symbols-outlined" aria-hidden="true">arrow_back</span>
          {t("public.news.article.back")}
        </Link>
        {body}
      </div>
    </section>
  );
}

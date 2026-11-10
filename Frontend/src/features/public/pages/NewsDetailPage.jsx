import { useTranslation } from "react-i18next";
import useLandingContent from "../landing/useLandingContent";
import { sectionOf, mergeItems, itemKey, isSafeLink, isSectionVisible, DEFAULT_NEWS } from "../landing/landingContent";

const latestNews = [
  {
    image: "https://images.unsplash.com/photo-1512684555490-d5f2ec538bd7?auto=format&fit=crop&w=220&q=80",
    title: "public.news.items.l0.title",
  },
  {
    image: "https://images.unsplash.com/photo-1517048676732-d65bc937f952?auto=format&fit=crop&w=220&q=80",
    title: "public.news.items.l1.title",
  },
  {
    image: "https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&w=220&q=80",
    title: "public.news.items.l2.title",
  },
];

export default function NewsDetailPage() {
  const { t } = useTranslation();
  const { content } = useLandingContent();
  const defaultPosts = DEFAULT_NEWS.map(([id, image]) => ({
    image_url: image,
    meta: t(`public.news.items.${id}.date`),
    title: t(`public.news.items.${id}.title`),
    body: t(`public.news.items.${id}.desc`),
    link_url: "",
  }));
  const posts = isSectionVisible(content, "news") ? mergeItems(sectionOf(content, "news"), defaultPosts) : [];

  const categories = [
    { name: t("public.news.categoryList.history"), count: 28 },
    { name: t("public.news.categoryList.rituals"), count: 19 },
    { name: t("public.news.categoryList.tech"), count: 14 },
    { name: t("public.news.categoryList.people"), count: 8 },
  ];

  return (
    <section className="news-page">
      <div className="news-hero">
        <div className="container">
          <h1>{t("public.news.title")}</h1>
          <p>{t("public.news.subtitle")}</p>
          <span className="news-hero-divider" />
        </div>
      </div>

      <div className="news-surface">
        <div className="container news-layout">
          <section className="news-grid">
            {posts.map((post, index) => (
              <article key={itemKey(post, index)} className={`news-card feature-card ${index < 2 ? "wide-card" : "small-card"}`}>
                {post.image_url && <img src={post.image_url} alt={post.title} />}
                <div className="news-card-body">
                  <span className="news-date">{post.meta}</span>
                  <h2>{post.title}</h2>
                  <p>{post.body}</p>
                  <a href={isSafeLink(post.link_url) ? post.link_url : "#"}>{post.link_label || t("public.news.readMore")}</a>
                </div>
              </article>
            ))}

            <div className="news-pagination">
              <button type="button">‹</button>
              <button type="button" className="active">1</button>
              <button type="button">2</button>
              <button type="button">3</button>
              <button type="button">›</button>
            </div>
          </section>

          <aside className="news-sidebar">
            <section className="sidebar-block sidebar-latest">
              <h3>{t("public.news.featured")}</h3>
              <div className="latest-list">
                {latestNews.map((item) => (
                  <article key={item.title} className="latest-item">
                    <img src={item.image} alt={t(item.title)} />
                    <p>{t(item.title)}</p>
                  </article>
                ))}
              </div>
            </section>

            <section className="sidebar-block subscribe-card">
              <div className="subscribe-icon">✉</div>
              <h3>{t("public.news.subscribe.title")}</h3>
              <p>{t("public.news.subscribe.desc")}</p>
              <input
                type="email"
                placeholder={t("public.news.subscribe.placeholder")}
                aria-label={t("public.news.subscribe.placeholder")}
              />
              <button type="button">{t("public.news.subscribe.submit")}</button>
            </section>

            <section className="sidebar-block category-card">
              <h3>{t("public.news.categories")}</h3>
              <ul>
                {categories.map((item) => (
                  <li key={item.name}>
                    <span>{item.name}</span>
                    <strong>{item.count}</strong>
                  </li>
                ))}
              </ul>
            </section>
          </aside>
        </div>
      </div>
    </section>
  );
}

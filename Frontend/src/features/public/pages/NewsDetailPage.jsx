import { useTranslation } from "react-i18next";

const featuredPosts = [
  {
    image: "https://images.unsplash.com/photo-1495020689067-958852a7765e?auto=format&fit=crop&w=900&q=80",
    date: "public.news.items.f0.date",
    title: "public.news.items.f0.title",
    desc: "public.news.items.f0.desc",
  },
  {
    image: "https://images.unsplash.com/photo-1505798577917-a65157d3320a?auto=format&fit=crop&w=900&q=80",
    date: "public.news.items.f1.date",
    title: "public.news.items.f1.title",
    desc: "public.news.items.f1.desc",
  },
  {
    image: "https://images.unsplash.com/photo-1518895949257-7621c3c786d7?auto=format&fit=crop&w=900&q=80",
    date: "public.news.items.f2.date",
    title: "public.news.items.f2.title",
    desc: "public.news.items.f2.desc",
  },
  {
    image: "https://images.unsplash.com/photo-1525920980995-f8a1b3cbbf0f?auto=format&fit=crop&w=900&q=80",
    date: "public.news.items.f3.date",
    title: "public.news.items.f3.title",
    desc: "public.news.items.f3.desc",
  },
];

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
            <article className="news-card feature-card wide-card">
              <img src={featuredPosts[0].image} alt={t(featuredPosts[0].title)} />
              <div className="news-card-body">
                <span className="news-date">{t(featuredPosts[0].date)}</span>
                <h2>{t(featuredPosts[0].title)}</h2>
                <p>{t(featuredPosts[0].desc)}</p>
                <a href="#">{t("public.news.readMore")}</a>
              </div>
            </article>

            <article className="news-card feature-card wide-card">
              <img src={featuredPosts[1].image} alt={t(featuredPosts[1].title)} />
              <div className="news-card-body">
                <span className="news-date">{t(featuredPosts[1].date)}</span>
                <h2>{t(featuredPosts[1].title)}</h2>
                <p>{t(featuredPosts[1].desc)}</p>
                <a href="#">{t("public.news.readMore")}</a>
              </div>
            </article>

            <article className="news-card feature-card small-card">
              <img src={featuredPosts[2].image} alt={t(featuredPosts[2].title)} />
              <div className="news-card-body">
                <span className="news-date">{t(featuredPosts[2].date)}</span>
                <h2>{t(featuredPosts[2].title)}</h2>
                <p>{t(featuredPosts[2].desc)}</p>
                <a href="#">{t("public.news.readMore")}</a>
              </div>
            </article>

            <article className="news-card feature-card small-card">
              <img src={featuredPosts[3].image} alt={t(featuredPosts[3].title)} />
              <div className="news-card-body">
                <span className="news-date">{t(featuredPosts[3].date)}</span>
                <h2>{t(featuredPosts[3].title)}</h2>
                <p>{t(featuredPosts[3].desc)}</p>
                <a href="#">{t("public.news.readMore")}</a>
              </div>
            </article>

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

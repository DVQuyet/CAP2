import { useTranslation } from "react-i18next";

const featuredPosts = [
  {
    image: "https://images.unsplash.com/photo-1495020689067-958852a7765e?auto=format&fit=crop&w=900&q=80",
    date: "01 THÁNG 10, 2025",
    title: "Khai mạc lễ hội tổ tông họ Nguyễn tại Cổ Đô Huệ",
    desc: "Sự kiện lớn nhất trong năm của dòng họ Nguyễn thu hút đông đảo bà con về tham dự và góp công gìn giữ nếp cổ truyền.",
  },
  {
    image: "https://images.unsplash.com/photo-1505798577917-a65157d3320a?auto=format&fit=crop&w=900&q=80",
    date: "12 THÁNG 8, 2025",
    title: "Ứng dụng AI vào phục dựng ảnh cũ cho gia tộc",
    desc: "Công nghệ trí tuệ nhân tạo giúp khôi phục hình ảnh tư liệu, tạo nên kho lưu trữ giàu cảm xúc cho dòng tộc Việt.",
  },
  {
    image: "https://images.unsplash.com/photo-1518895949257-7621c3c786d7?auto=format&fit=crop&w=900&q=80",
    date: "08 THÁNG 6, 2025",
    title: "Phát hiện bản gia phả bằng chữ Hán cổ tại Thanh Hóa",
    desc: "Dòng tư liệu quý hiếm được tìm thấy trong gia tộc, mở ra hành trình nghiên cứu và số hóa lại phả hệ truyền thống.",
  },
  {
    image: "https://images.unsplash.com/photo-1525920980995-f8a1b3cbbf0f?auto=format&fit=crop&w=900&q=80",
    date: "09 THÁNG 6, 2025",
    title: "Hành trình tìm lại gốc gác của Việt kiều thế hệ thứ 3",
    desc: "Câu chuyện kết nối thế hệ xa quê với cội nguồn nhờ công cụ tra cứu và lưu trữ dữ liệu gia phả số hóa.",
  },
];

const latestNews = [
  {
    image: "https://images.unsplash.com/photo-1512684555490-d5f2ec538bd7?auto=format&fit=crop&w=220&q=80",
    title: "Những ngày giỗ tổ truyền thống trong thời đại số",
  },
  {
    image: "https://images.unsplash.com/photo-1517048676732-d65bc937f952?auto=format&fit=crop&w=220&q=80",
    title: "Hướng dẫn lập gia phả cho người mới bắt đầu",
  },
  {
    image: "https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&w=220&q=80",
    title: "Bảo tồn di sản truyện thờ và hương ước làng",
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
              <img src={featuredPosts[0].image} alt={featuredPosts[0].title} />
              <div className="news-card-body">
                <span className="news-date">{featuredPosts[0].date}</span>
                <h2>{featuredPosts[0].title}</h2>
                <p>{featuredPosts[0].desc}</p>
                <a href="#">{t("public.news.readMore")}</a>
              </div>
            </article>

            <article className="news-card feature-card wide-card">
              <img src={featuredPosts[1].image} alt={featuredPosts[1].title} />
              <div className="news-card-body">
                <span className="news-date">{featuredPosts[1].date}</span>
                <h2>{featuredPosts[1].title}</h2>
                <p>{featuredPosts[1].desc}</p>
                <a href="#">{t("public.news.readMore")}</a>
              </div>
            </article>

            <article className="news-card feature-card small-card">
              <img src={featuredPosts[2].image} alt={featuredPosts[2].title} />
              <div className="news-card-body">
                <span className="news-date">{featuredPosts[2].date}</span>
                <h2>{featuredPosts[2].title}</h2>
                <p>{featuredPosts[2].desc}</p>
                <a href="#">{t("public.news.readMore")}</a>
              </div>
            </article>

            <article className="news-card feature-card small-card">
              <img src={featuredPosts[3].image} alt={featuredPosts[3].title} />
              <div className="news-card-body">
                <span className="news-date">{featuredPosts[3].date}</span>
                <h2>{featuredPosts[3].title}</h2>
                <p>{featuredPosts[3].desc}</p>
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
                    <img src={item.image} alt={item.title} />
                    <p>{item.title}</p>
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

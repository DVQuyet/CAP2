import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import useLandingContent from "../landing/useLandingContent";
import {
  sectionOf, mergeItems, mergeSectionText, itemKey, isSectionVisible, isExternalLink,
  newsItemHref, buildDefaultSection, DEFAULT_NEWS,
} from "../landing/landingContent";

// Liên kết theo đích: nội bộ dùng <Link>, ngoài dùng <a> mở tab mới; đích rỗng thì chỉ hiện nội dung.
function HrefWrap({ href, className, children }) {
  if (!href) return <div className={className}>{children}</div>;
  if (isExternalLink(href)) {
    return <a className={className} href={href} target="_blank" rel="noopener noreferrer">{children}</a>;
  }
  return <Link className={className} to={href}>{children}</Link>;
}

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

  // Sidebar: mỗi khối đọc từ mục riêng, DB trống thì dùng mặc định; ẩn được.
  const sidebarOf = (key) => {
    const defaults = buildDefaultSection(key, t);
    const section = sectionOf(content, key);
    return {
      visible: isSectionVisible(content, key),
      text: mergeSectionText(section, defaults),
      items: mergeItems(section, defaults.items || []),
    };
  };
  const latest = sidebarOf("news_latest");
  const categories = sidebarOf("news_categories");
  const subscribe = sidebarOf("news_subscribe");

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
            {posts.map((post, index) => {
              const href = newsItemHref(post);
              const label = post.link_label || t("public.news.readMore");
              return (
                <article key={itemKey(post, index)} className={`news-card feature-card ${index < 2 ? "wide-card" : "small-card"}`}>
                  {post.image_url && <img src={post.image_url} alt={post.title} />}
                  <div className="news-card-body">
                    <span className="news-date">{post.meta}</span>
                    <h2>{post.title}</h2>
                    <p>{post.body}</p>
                    {href && (
                      isExternalLink(href)
                        ? <a href={href} target="_blank" rel="noopener noreferrer">{label}</a>
                        : <Link to={href}>{label}</Link>
                    )}
                  </div>
                </article>
              );
            })}

            <div className="news-pagination">
              <button type="button">‹</button>
              <button type="button" className="active">1</button>
              <button type="button">2</button>
              <button type="button">3</button>
              <button type="button">›</button>
            </div>
          </section>

          <aside className="news-sidebar">
            {latest.visible && latest.items.length > 0 && (
              <section className="sidebar-block sidebar-latest">
                <h3>{latest.text.title}</h3>
                <div className="latest-list">
                  {latest.items.map((item, index) => (
                    <HrefWrap key={itemKey(item, index)} href={newsItemHref(item)} className="latest-item">
                      {item.image_url && <img src={item.image_url} alt={item.title} />}
                      <p>{item.title}</p>
                    </HrefWrap>
                  ))}
                </div>
              </section>
            )}

            {subscribe.visible && (
              <section className="sidebar-block subscribe-card">
                <div className="subscribe-icon">✉</div>
                <h3>{subscribe.text.title}</h3>
                <p>{subscribe.text.body}</p>
                <input type="email" placeholder={subscribe.text.tag} aria-label={subscribe.text.tag} />
                <button type="button">{subscribe.text.quote}</button>
              </section>
            )}

            {categories.visible && categories.items.length > 0 && (
              <section className="sidebar-block category-card">
                <h3>{categories.text.title}</h3>
                <ul>
                  {categories.items.map((item, index) => (
                    <li key={itemKey(item, index)}>
                      <span>{item.title}</span>
                      <strong>{item.meta}</strong>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </aside>
        </div>
      </div>
    </section>
  );
}

import { useTranslation } from "react-i18next";
import LandingFamilyTree from "./LandingFamilyTree";
import useLandingContent from "../landing/useLandingContent";
import { sectionOf, mergeSectionText, mergeItems, itemKey, DEFAULT_FEATURES_IMAGE, DEFAULT_STATS } from "../landing/landingContent";

export default function FeatureDetailPage() {
  const { t } = useTranslation();
  const { content } = useLandingContent();
  const featuresSection = sectionOf(content, "features");
  const featuresText = mergeSectionText(featuresSection, {
    tag: t("public.features.advanced.tag"),
    title: t("public.features.advanced.title"),
    image_url: DEFAULT_FEATURES_IMAGE,
  });

  const defaultAdvancedCards = [
    {
      icon: "bolt",
      title: t("public.features.advanced.items.auto.title"),
      body: t("public.features.advanced.items.auto.desc"),
    },
    {
      icon: "notifications_active",
      title: t("public.features.advanced.items.events.title"),
      body: t("public.features.advanced.items.events.desc"),
    },
    {
      icon: "security",
      title: t("public.features.advanced.items.security.title"),
      body: t("public.features.advanced.items.security.desc"),
    },
  ];

  const advancedCards = mergeItems(featuresSection, defaultAdvancedCards);

  const stats = mergeItems(
    sectionOf(content, "stats"),
    DEFAULT_STATS.map(([id, value]) => ({ meta: value, title: t(`public.stats.${id}`) }))
  );

  const eventCards = [
    {
      icon: "event_upcoming",
      title: t("public.features.events.cards.notifications.title"),
      desc: t("public.features.events.cards.notifications.desc"),
    },
    {
      icon: "work_history",
      title: t("public.features.events.cards.connection.title"),
      desc: t("public.features.events.cards.connection.desc"),
    },
    {
      icon: "history",
      title: t("public.features.events.cards.rituals.title"),
      desc: t("public.features.events.cards.rituals.desc"),
    },
    {
      icon: "confirmation_number",
      title: t("public.features.events.cards.budget.title"),
      desc: t("public.features.events.cards.budget.desc"),
    },
  ];

  const preservationPoints = t("public.features.preservation.points", { returnObjects: true }) || [];

  return (
    <section className="feature-page">
      <div className="container">
        <header className="feature-page-header stitch-like">
          <span className="section-tag">{t("public.features.demo.tag")}</span>
          <h1>{t("public.features.demo.tag")}</h1>
          <p>{t("public.features.demo.desc")}</p>
        </header>

        <section className="feature-detail-block stitch-split">
          <div className="feature-detail-copy">
            <h2>{t("public.features.demo.title")}</h2>
            <p>{t("public.features.demo.desc")}</p>

            <div className="feature-detail-actions">
              <button type="button">
                <span className="material-symbols-outlined">image</span>
                {t("public.features.demo.viewImage")}
              </button>
              <button type="button">
                <span className="material-symbols-outlined">account_tree</span>
                {t("public.features.demo.createGenerations")}
              </button>
            </div>

            <ul className="feature-detail-points">
              <li>{t("public.features.demo.point1")}</li>
              <li>{t("public.features.demo.point2")}</li>
              <li>{t("public.features.demo.point3")}</li>
            </ul>
          </div>

          <div className="feature-detail-visual static-tree-visual">
            <LandingFamilyTree compact />
          </div>
        </section>

        <section className="feature-advanced stitch-split second">
          <div className="feature-advanced-image">
            <img
              src={featuresText.image_url}
              alt={featuresText.tag}
            />
          </div>

          <div>
            <div className="feature-advanced-heading">
              <span className="section-tag">{featuresText.tag}</span>
              <h2>{featuresText.title}</h2>
            </div>

            <div className="feature-advanced-grid">
              {advancedCards.map((card, index) => (
                <article key={itemKey(card, index)} className="feature-card-detail">
                  <span className="material-symbols-outlined card-icon">{card.icon}</span>
                  <div>
                    <h3>{card.title}</h3>
                    <p>{card.body}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="feature-kpi-grid">
          {stats.map((item, index) => (
            <div key={itemKey(item, index)}>
              <strong>{item.meta}</strong>
              <p>{item.title}</p>
            </div>
          ))}
        </section>

        <section className="feature-event-section">
          <header className="feature-sub-header">
            <h2>{t("public.features.events.title")}</h2>
            <p>{t("public.features.events.desc")}</p>
          </header>

          <div className="event-layout">
            <article className="event-timeline-card">
              <span className="event-timeline-label">{t("public.features.events.calendarLabel")}</span>
              <div className="event-date-box">
                <strong>15</strong>
                <p>{t("public.features.events.lunarMonth")}</p>
              </div>
              <ul>
                <li>
                  <span>{t("public.features.events.sampleEvent1")}</span>
                  <em>{t("public.features.events.sampleTime1")}</em>
                </li>
                <li>
                  <span>{t("public.features.events.sampleEvent2")}</span>
                  <em>{t("public.features.events.sampleTime2")}</em>
                </li>
              </ul>
            </article>

            <div className="event-grid">
              {eventCards.map((card) => (
                <article key={card.title} className="event-item-card">
                  <span className="material-symbols-outlined">{card.icon}</span>
                  <h3>{card.title}</h3>
                  <p>{card.desc}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="feature-preservation-section">
          <div className="preservation-media">
            <img
              src="https://images.unsplash.com/photo-1516410529446-2c777cb7366d?auto=format&fit=crop&w=900&q=80"
              alt={t("public.features.preservation.imageAlt1")}
            />
            <img
              src="https://images.unsplash.com/photo-1614064641938-3bbee52942c7?auto=format&fit=crop&w=900&q=80"
              alt={t("public.features.preservation.imageAlt2")}
            />
          </div>

          <div className="preservation-content">
            <h2>{t("public.features.preservation.title")}</h2>
            <p>{t("public.features.preservation.desc")}</p>

            <div className="preservation-list">
              {preservationPoints.map((item, index) => (
                <div key={item} className="preservation-point">
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <p>{item}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="feature-bottom-cta">
          <h2>{t("public.features.cta.title")}</h2>
          <p>{t("public.features.cta.subtitle")}</p>
          <div className="feature-bottom-actions">
            <a href="#">{t("public.features.cta.start")}</a>
            <a href="#" className="outline">
              {t("public.features.cta.learnMore")}
            </a>
          </div>
        </section>
      </div>
    </section>
  );
}

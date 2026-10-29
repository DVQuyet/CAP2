import { useTranslation } from "react-i18next";
import useLandingContent from "../landing/useLandingContent";
import { sectionOf, mergeItems, itemKey, isSectionVisible, DEFAULT_GUIDE_STEPS } from "../landing/landingContent";

export default function GuideDetailPage() {
  const { t } = useTranslation();
  const { content } = useLandingContent();

  const defaultSteps = DEFAULT_GUIDE_STEPS.map(([id, icon]) => ({
    title: t(`public.guide.steps.${id}.title`),
    body: t(`public.guide.steps.${id}.desc`),
    icon,
  }));
  const steps = isSectionVisible(content, "guide") ? mergeItems(sectionOf(content, "guide"), defaultSteps) : [];

  const faqs = t("public.guide.faqs", { returnObjects: true }) || [];

  return (
    <section className="guide-page">
      <div className="guide-hero">
        <div className="container guide-hero-content">
          <h1>{t("public.guide.title")}</h1>
          <p>{t("public.guide.subtitle")}</p>
          <span className="guide-hero-divider" />
        </div>
      </div>

      <div className="guide-surface">
        <div className="container">
          <section className="guide-steps">
            <h2 className="guide-section-title">{t("public.guide.stepsTitle")}</h2>
            <div className="steps-grid">
              {steps.map((step, index) => (
                <article key={itemKey(step, index)} className="guide-step-card">
                  <div className="step-number">{String(index + 1).padStart(2, "0")}</div>
                  <span className="material-symbols-outlined step-icon">{step.icon}</span>
                  <h3>{step.title}</h3>
                  <p>{step.body}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="guide-video-section">
            <h2 className="guide-section-title">{t("public.guide.videoTitle")}</h2>
            <div className="video-grid">
              <article className="video-card">
                <div className="video-thumb">
                  <span className="material-symbols-outlined play-icon">play_circle</span>
                </div>
                <h3>{t("public.guide.videos.v1.title")}</h3>
                <p>{t("public.guide.videos.v1.desc")}</p>
              </article>
              <article className="video-card">
                <div className="video-thumb">
                  <span className="material-symbols-outlined play-icon">play_circle</span>
                </div>
                <h3>{t("public.guide.videos.v2.title")}</h3>
                <p>{t("public.guide.videos.v2.desc")}</p>
              </article>
              <article className="video-card">
                <div className="video-thumb">
                  <span className="material-symbols-outlined play-icon">play_circle</span>
                </div>
                <h3>{t("public.guide.videos.v3.title")}</h3>
                <p>{t("public.guide.videos.v3.desc")}</p>
              </article>
            </div>
          </section>

          <section className="guide-faq">
            <h2 className="guide-section-title">{t("public.guide.faqTitle")}</h2>
            <div className="faq-list">
              {faqs.map((item, idx) => (
                <details key={idx} className="faq-item">
                  <summary className="faq-question">
                    <span>{item.q}</span>
                    <span className="faq-icon">›</span>
                  </summary>
                  <div className="faq-answer">
                    <p>{item.a}</p>
                  </div>
                </details>
              ))}
            </div>
          </section>

          <section className="guide-support">
            <div className="support-card">
              <h2>{t("public.guide.support.title")}</h2>
              <p>{t("public.guide.support.desc")}</p>
              <div className="support-actions">
                <a href="mailto:support@giaphaviet.com" className="support-link">
                  <span className="material-symbols-outlined">mail_outline</span>
                  {t("public.guide.support.email")}
                </a>
                <a href="#" className="support-link">
                  <span className="material-symbols-outlined">chat_bubble_outline</span>
                  {t("public.guide.support.chat")}
                </a>
              </div>
            </div>
          </section>
        </div>
      </div>
    </section>
  );
}
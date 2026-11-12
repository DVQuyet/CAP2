import { useTranslation } from "react-i18next";
import useLandingContent from "../landing/useLandingContent";
import {
  sectionOf,
  mergeItems,
  mergeSectionText,
  buildDefaultSection,
  buildVideoEmbed,
  paragraphsOf,
  itemKey,
  isSectionVisible,
  DEFAULT_GUIDE_STEPS,
} from "../landing/landingContent";
import "./GuideDetailPage.css";

export default function GuideDetailPage() {
  const { t } = useTranslation();
  const { content } = useLandingContent();

  const defaultSteps = DEFAULT_GUIDE_STEPS.map(([id, icon]) => ({
    title: t(`public.guide.steps.${id}.title`),
    body: t(`public.guide.steps.${id}.desc`),
    icon,
  }));
  const steps = isSectionVisible(content, "guide") ? mergeItems(sectionOf(content, "guide"), defaultSteps) : [];

  const videosDefault = buildDefaultSection("guide_videos", t);
  const videosText = mergeSectionText(sectionOf(content, "guide_videos"), videosDefault);
  const videos = mergeItems(sectionOf(content, "guide_videos"), videosDefault.items);

  const faqDefault = buildDefaultSection("faq", t);
  const faqText = mergeSectionText(sectionOf(content, "faq"), faqDefault);
  const faqs = mergeItems(sectionOf(content, "faq"), faqDefault.items);

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

          {isSectionVisible(content, "guide_videos") && (
            <section className="guide-video-section">
              <h2 className="guide-section-title">{videosText.title}</h2>
              <div className="video-grid">
                {videos.map((video, index) => {
                  const embed = buildVideoEmbed(video.link_url);
                  return (
                    <article key={itemKey(video, index)} className="video-card">
                      <div className="video-thumb">
                        {embed && embed.kind === "iframe" ? (
                          <iframe
                            src={embed.src}
                            title={video.title || `video ${index + 1}`}
                            loading="lazy"
                            allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                            allowFullScreen
                            referrerPolicy="strict-origin-when-cross-origin"
                          />
                        ) : embed && embed.kind === "video" ? (
                          <video controls preload="metadata" src={embed.src} />
                        ) : (
                          <span className="material-symbols-outlined play-icon">play_circle</span>
                        )}
                      </div>
                      <h3>{video.title}</h3>
                      <p>{video.body}</p>
                    </article>
                  );
                })}
              </div>
            </section>
          )}

          {isSectionVisible(content, "faq") && (
            <section className="guide-faq">
              <h2 className="guide-section-title">{faqText.title}</h2>
              <div className="faq-list">
                {faqs.map((item, idx) => (
                  <details key={itemKey(item, idx)} className="faq-item">
                    <summary className="faq-question">
                      <span>{item.title}</span>
                      <span className="faq-icon">›</span>
                    </summary>
                    <div className="faq-answer">
                      {paragraphsOf(item.body).map((line, i) => (
                        <p key={i}>{line}</p>
                      ))}
                    </div>
                  </details>
                ))}
              </div>
            </section>
          )}

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
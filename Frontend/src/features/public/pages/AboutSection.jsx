import { useTranslation } from "react-i18next";
import useLandingContent from "../landing/useLandingContent";
import { sectionOf, mergeSectionText, paragraphsOf, DEFAULT_ABOUT_IMAGE } from "../landing/landingContent";

export default function AboutSection() {
  const { t } = useTranslation();
  const { content } = useLandingContent();
  const merged = mergeSectionText(sectionOf(content, "about"), {
    tag: t("public.about.tag"),
    title: t("public.about.title"),
    body: `${t("public.about.p1")}\n\n${t("public.about.p2")}`,
    quote: t("public.about.quote"),
    image_url: DEFAULT_ABOUT_IMAGE,
  });

  return (
    <section className="about-section">
      <div className="container two-col">
        <div>
          <span className="section-tag">{merged.tag}</span>
          <h2>{merged.title}</h2>
          {paragraphsOf(merged.body).map((paragraph, index) => (
            <p key={index}>{paragraph}</p>
          ))}
          <blockquote>{merged.quote}</blockquote>
        </div>
        <img src={merged.image_url} alt={t("public.about.imageAlt")} />
      </div>
    </section>
  );
}

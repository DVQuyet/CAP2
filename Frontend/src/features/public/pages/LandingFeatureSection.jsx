import { useTranslation } from "react-i18next";
import LandingFamilyTree from "./LandingFamilyTree";
import useLandingContent from "../landing/useLandingContent";
import { sectionOf, mergeSectionText, mergeItems, itemKey, DEFAULT_FEATURES_IMAGE } from "../landing/landingContent";

export default function LandingFeatureSection() {
  const { t } = useTranslation();
  const { content } = useLandingContent();
  const section = sectionOf(content, "features");

  const defaultFeatures = [
    { icon: "bolt", title: t("public.features.advanced.items.auto.title"), body: t("public.features.advanced.items.auto.desc") },
    { icon: "notifications_active", title: t("public.features.advanced.items.events.title"), body: t("public.features.advanced.items.events.desc") },
    { icon: "security", title: t("public.features.advanced.items.security.title"), body: t("public.features.advanced.items.security.desc") },
  ];
  const features = mergeItems(section, defaultFeatures);
  const merged = mergeSectionText(section, {
    tag: t("public.features.advanced.tag"),
    title: t("public.features.advanced.title"),
    image_url: DEFAULT_FEATURES_IMAGE,
  });

  return (
    <>
      <section className="landing-feature-demo" id="loi-ich">
        <div className="container landing-feature-grid">
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
            </ul>
          </div>
          <div className="landing-feature-tree-card"><LandingFamilyTree compact /></div>
        </div>
      </section>
      <section className="features-section" id="tin-tuc">
        <div className="container two-col">
          <img src={merged.image_url} alt={merged.title} />
          <div>
            <span className="section-tag">{merged.tag}</span>
            <h3>{merged.title}</h3>
            <div className="feature-list">
              {features.map((item, index) => (
                <article key={itemKey(item, index)}>
                  <span className="material-symbols-outlined">{item.icon}</span>
                  <div><h4>{item.title}</h4><p>{item.body}</p></div>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

import { useTranslation } from "react-i18next";
import LandingFamilyTree from "./LandingFamilyTree";

export default function LandingFeatureSection() {
  const { t } = useTranslation();

  const features = [
    { icon: "bolt", title: t("public.features.advanced.items.auto.title"), desc: t("public.features.advanced.items.auto.desc") },
    { icon: "notifications_active", title: t("public.features.advanced.items.events.title"), desc: t("public.features.advanced.items.events.desc") },
    { icon: "security", title: t("public.features.advanced.items.security.title"), desc: t("public.features.advanced.items.security.desc") },
  ];

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
          <img src="https://lh3.googleusercontent.com/aida-public/AB6AXuAd6zBRvZR3R4FNjtUr2lLEx9nhgeCvjODU75n1JNSZXsYbZbBF_gkjblSR6pitSFdONbGyENkDH6yqIi4uS-Ykb6p6ILCjP0nXnqvGTlFy9hTWmvVSDjpMIx7HWlHJsTVzyp8Eupx2Tm3Xyjng359b4cGX8X6_EDIt4xaLllWGrajQxWqaRni5VzHCLHVKEAERaVpCv2KL8n9_4GnV-fPjGCzGNfAwYlnkE_xJidn-Rg1rLL1S3goPoSirM6dhlbwjipscoiT16iOH" alt={t("public.features.advanced.title")} />
          <div>
            <span className="section-tag">{t("public.features.advanced.tag")}</span>
            <h3>{t("public.features.advanced.title")}</h3>
            <div className="feature-list">
              {features.map((item) => (
                <article key={item.title}>
                  <span className="material-symbols-outlined">{item.icon}</span>
                  <div><h4>{item.title}</h4><p>{item.desc}</p></div>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

import { useTranslation } from "react-i18next";

export default function AboutSection() {
  const { t } = useTranslation();

  return (
    <section className="about-section">
      <div className="container two-col">
        <div>
          <span className="section-tag">{t("public.about.tag")}</span>
          <h2>{t("public.about.title")}</h2>
          <p>{t("public.about.p1")}</p>
          <p>{t("public.about.p2")}</p>
          <blockquote>{t("public.about.quote")}</blockquote>
        </div>
        <img src="https://lh3.googleusercontent.com/aida-public/AB6AXuDjOO8FqGtyciLc_RM3yjBdnFgPaDBtd8F1gqaozi4SwM4G2w-QvhSnWwixZcPdS8NKiAhWZOFwrqY47U0lPpby__qL1W4NzdvNVDQUR_XEdqRLMh8M_97Qbps5y-9DTcqikY3n4NXF4aSkatMZloTl9-ATAlMQsdYCkdjdcxBcWNtshvYvrb5Ix4qbApN9y1mKbD93z1Y1E2CynGl0qJ1mlAOIvUExbF4rh_jb2abE4zBAAqIHi2km4lGf3RSKC_vSkTW7AA310wYh" alt={t("public.about.imageAlt")} />
      </div>
    </section>
  );
}

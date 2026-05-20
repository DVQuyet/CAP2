import { useNavigate } from "react-router-dom";
import { useTranslation, Trans } from "react-i18next";
import LandingFamilyTree from "./LandingFamilyTree";

export default function HeroBanner() {
  const navigate = useNavigate();
  const { t } = useTranslation();

  return (
    <section className="hero-banner">
      <div className="hero-overlay" />
      <div className="hero-content">
        <div className="hero-left" data-aos="slide-right" data-aos-delay="120" data-aos-duration="1500">
          <h1 className="hero-title-cinzel" data-aos="slide-right" data-aos-delay="180" data-aos-duration="1500">
            <Trans i18nKey="public.hero.title">Gìn giữ cội nguồn,<br />Kết nối thế hệ</Trans>
          </h1>
          <p data-aos="slide-right" data-aos-delay="260" data-aos-duration="1500">
            {t("public.hero.subtitle")}
          </p>
          <div className="hero-cta" data-aos="slide-up" data-aos-delay="340" data-aos-duration="1500">
            <button type="button">{t("public.hero.explore")}</button>
            <button type="button" onClick={() => navigate("/clan-register")}>{t("public.hero.createClan")}</button>
          </div>
        </div>
        <div className="hero-right"><LandingFamilyTree /></div>
      </div>
    </section>
  );
}

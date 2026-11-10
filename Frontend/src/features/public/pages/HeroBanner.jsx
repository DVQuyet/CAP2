import { useNavigate } from "react-router-dom";
import { useTranslation, Trans } from "react-i18next";
import LandingFamilyTree from "./LandingFamilyTree";
import useLandingContent from "../landing/useLandingContent";
import { sectionOf, mergeItems, pickText, linesOf, isSafeLink, isExternalLink } from "../landing/landingContent";

export default function HeroBanner() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { content } = useLandingContent();
  const section = sectionOf(content, "hero");

  const title = pickText(section?.title, "");
  const subtitle = pickText(section?.body, t("public.hero.subtitle"));
  const defaultButtons = [
    { id: "explore", link_label: t("public.hero.explore"), link_url: "" },
    { id: "create", link_label: t("public.hero.createClan"), link_url: "/clan-register" },
  ];
  const buttons = mergeItems(section, defaultButtons);

  const openLink = (url) => {
    if (!isSafeLink(url)) return;
    if (isExternalLink(url)) window.location.assign(url);
    else navigate(url);
  };

  // Ảnh nền do admin đặt thay cho ảnh mặc định trong CSS (giữ nguyên lớp phủ và gradient dự phòng).
  const bannerStyle = isSafeLink(section?.image_url)
    ? { background: `url("${section.image_url}") center top / cover no-repeat, linear-gradient(135deg, #4b0404 0%, var(--color-maroon) 45%, #560505 100%)` }
    : undefined;

  return (
    <section className="hero-banner" style={bannerStyle}>
      <div className="hero-overlay" />
      <div className="hero-content">
        <div className="hero-left" data-aos="slide-right" data-aos-delay="120" data-aos-duration="1500">
          <h1 className="hero-title-cinzel" data-aos="slide-right" data-aos-delay="180" data-aos-duration="1500">
            {title ? (
              linesOf(title).map((line, index) => (
                <span key={index}>{index > 0 && <br />}{line}</span>
              ))
            ) : (
              <Trans i18nKey="public.hero.title" />
            )}
          </h1>
          <p data-aos="slide-right" data-aos-delay="260" data-aos-duration="1500">
            {subtitle}
          </p>
          <div className="hero-cta" data-aos="slide-up" data-aos-delay="340" data-aos-duration="1500">
            {buttons.map((button, index) => (
              <button type="button" key={button.id ?? index} onClick={button.link_url ? () => openLink(button.link_url) : undefined}>
                {button.link_label}
              </button>
            ))}
          </div>
        </div>
        <div className="hero-right"><LandingFamilyTree /></div>
      </div>
    </section>
  );
}

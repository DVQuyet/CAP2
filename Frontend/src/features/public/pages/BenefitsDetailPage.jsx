import { useTranslation } from "react-i18next";
import useLandingContent from "../landing/useLandingContent";
import {
  sectionOf,
  isSectionVisible,
  orderSections,
  mergeSectionText,
  mergeItems,
  paragraphsOf,
  itemKey,
  DEFAULT_BENEFIT_CARDS,
  DEFAULT_BENEFIT_REASONS,
} from "../landing/landingContent";
import "./BenefitsDetailPage.css";

export default function BenefitsDetailPage() {
  const { t } = useTranslation();
  const { content } = useLandingContent();

  const benefitsSection = sectionOf(content, "benefits");
  const benefitsText = mergeSectionText(benefitsSection, {
    title: t("public.benefits.title"),
    body: t("public.benefits.subtitle"),
  });
  const benefitCards = mergeItems(
    benefitsSection,
    DEFAULT_BENEFIT_CARDS.map(([id, icon]) => ({
      icon,
      title: t(`public.benefits.cards.${id}.title`),
      body: t(`public.benefits.cards.${id}.desc`),
    }))
  );

  const whySection = sectionOf(content, "benefits_why");
  const whyText = mergeSectionText(whySection, { title: t("public.benefits.why.title") });
  const reasons = mergeItems(
    whySection,
    DEFAULT_BENEFIT_REASONS.map(([id, icon]) => ({
      icon,
      title: t(`public.benefits.why.items.${id}.title`),
      body: t(`public.benefits.why.items.${id}.desc`),
    }))
  );

  const blocks = {
    benefits: (
      <section key="benefits" className="benefits-card-grid">
        {benefitCards.map((card, index) => (
          <article key={itemKey(card, index)} className="benefit-card">
            <span className="material-symbols-outlined">{card.icon}</span>
            <h3>{card.title}</h3>
            <p>{card.body}</p>
          </article>
        ))}
      </section>
    ),
    benefits_why: (
      <section key="benefits_why" className="benefits-why-card">
        <div className="benefits-why-head">
          <h2>{whyText.title}</h2>
          <span className="why-dot" />
        </div>

        <div className="benefits-why-grid">
          {reasons.map((item, index) => (
            <article key={itemKey(item, index)} className="benefits-why-item">
              <span className="material-symbols-outlined">{item.icon}</span>
              <div>
                <h4>{item.title}</h4>
                <p>{item.body}</p>
              </div>
            </article>
          ))}
        </div>
      </section>
    ),
  };

  const showBenefits = isSectionVisible(content, "benefits");
  const orderedKeys = orderSections(content, ["benefits", "benefits_why"]).filter((key) =>
    key === "benefits" ? showBenefits : isSectionVisible(content, key)
  );

  return (
    <section className="benefits-page">
      <div className="container benefits-container">
        {showBenefits && (
          <header className="benefits-hero">
            <h1>{benefitsText.title}</h1>
            {paragraphsOf(benefitsText.body).map((line, index) => (
              <p key={index}>{line}</p>
            ))}
            <span className="benefits-divider" />
          </header>
        )}

        {orderedKeys.map((key) => blocks[key])}
      </div>
    </section>
  );
}

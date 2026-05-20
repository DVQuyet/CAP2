import { useTranslation } from "react-i18next";

export default function BenefitsDetailPage() {
  const { t } = useTranslation();

  const benefitCards = [
    {
      icon: "groups",
      title: t("public.benefits.cards.connection.title"),
      desc: t("public.benefits.cards.connection.desc"),
    },
    {
      icon: "menu_book",
      title: t("public.benefits.cards.preservation.title"),
      desc: t("public.benefits.cards.preservation.desc"),
    },
    {
      icon: "school",
      title: t("public.benefits.cards.education.title"),
      desc: t("public.benefits.cards.education.desc"),
    },
  ];

  const reasons = [
    {
      icon: "tips_and_updates",
      title: t("public.benefits.why.items.ai.title"),
      desc: t("public.benefits.why.items.ai.desc"),
    },
    {
      icon: "verified_user",
      title: t("public.benefits.why.items.security.title"),
      desc: t("public.benefits.why.items.security.desc"),
    },
    {
      icon: "diversity_3",
      title: t("public.benefits.why.items.reminder.title"),
      desc: t("public.benefits.why.items.reminder.desc"),
    },
    {
      icon: "history_edu",
      title: t("public.benefits.why.items.storage.title"),
      desc: t("public.benefits.why.items.storage.desc"),
    },
  ];

  return (
    <section className="benefits-page">
      <div className="container benefits-container">
        <header className="benefits-hero">
          <h1>{t("public.benefits.title")}</h1>
          <p>
            {t("public.benefits.subtitle")}
          </p>
          <span className="benefits-divider" />
        </header>

        <section className="benefits-card-grid">
          {benefitCards.map((card) => (
            <article key={card.title} className="benefit-card">
              <span className="material-symbols-outlined">{card.icon}</span>
              <h3>{card.title}</h3>
              <p>{card.desc}</p>
            </article>
          ))}
        </section>

        <section className="benefits-why-card">
          <div className="benefits-why-head">
            <h2>{t("public.benefits.why.title")}</h2>
            <span className="why-dot" />
          </div>

          <div className="benefits-why-grid">
            {reasons.map((item) => (
              <article key={item.title} className="benefits-why-item">
                <span className="material-symbols-outlined">{item.icon}</span>
                <div>
                  <h4>{item.title}</h4>
                  <p>{item.desc}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

      </div>
    </section>
  );
}

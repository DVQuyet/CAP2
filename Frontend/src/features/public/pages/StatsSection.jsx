import { useTranslation } from "react-i18next";

export default function StatsSection() {
  const { t } = useTranslation();

  const stats = [
    ["1,200+", t("public.stats.clans")],
    ["500k+", t("public.stats.members")],
    ["250k+", t("public.stats.documents")],
    ["63", t("public.stats.provinces")],
  ];

  return (
    <section className="stats-section">
      <div className="container stats-grid">
        {stats.map(([value, label]) => (
          <div key={label}>
            <strong>{value}</strong>
            <p>{label}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

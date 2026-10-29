import { useTranslation } from "react-i18next";
import useLandingContent from "../landing/useLandingContent";
import { sectionOf, mergeItems, itemKey, DEFAULT_STATS } from "../landing/landingContent";

export default function StatsSection() {
  const { t } = useTranslation();
  const { content } = useLandingContent();

  const defaults = DEFAULT_STATS.map(([id, value]) => ({ id: null, meta: value, title: t(`public.stats.${id}`) }));
  const stats = mergeItems(sectionOf(content, "stats"), defaults);

  return (
    <section className="stats-section">
      <div className="container stats-grid">
        {stats.map((item, index) => (
          <div key={itemKey(item, index)}>
            <strong>{item.meta}</strong>
            <p>{item.title}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

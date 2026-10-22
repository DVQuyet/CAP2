import { useTranslation } from "react-i18next";

export default function FamilyPathVisualizer({ pathVisualizer }) {
  const { t } = useTranslation();
  const crumbs = pathVisualizer?.breadcrumb || [];
  if (!crumbs.length) return null;

  return (
    <div className="ai-path-visualizer" role="group" aria-label={t("aiChat.pathLabel")}>
      {crumbs.map((crumb, index) => (
        <div key={`${crumb}-${index}`} className="ai-path-node">
          <span className="ai-path-name">{crumb}</span>
          {index < crumbs.length - 1 ? (
            <span className="material-symbols-outlined ai-path-arrow" aria-hidden="true">arrow_forward</span>
          ) : null}
        </div>
      ))}
    </div>
  );
}

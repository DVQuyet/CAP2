import { useTranslation } from "react-i18next";
import FamilyPathVisualizer from "./FamilyPathVisualizer";

export default function RelationshipCard({ message }) {
  const { t } = useTranslation();
  const metadata = message?.metadata || message || {};
  const label = metadata.relationshipLabel || metadata.relationshipKey;
  const source = metadata.sourcePerson?.name;
  const target = metadata.targetPerson?.name;

  if (!label && !metadata.pathVisualizer) return null;

  return (
    <div className="ai-relationship-card">
      {label ? (
        <div className="ai-relationship-summary">
          <span className="material-symbols-outlined" aria-hidden="true">family_restroom</span>
          <div>
            <strong>{label}</strong>
            {source && target ? <small>{t("aiChat.relationOf", { target, source })}</small> : null}
          </div>
        </div>
      ) : null}
      <FamilyPathVisualizer pathVisualizer={metadata.pathVisualizer} />
    </div>
  );
}

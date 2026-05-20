import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import "./waiting.css";

const Waiting = () => {
  const { t } = useTranslation();
  return (
    <div className="waiting-page" data-no-translate="true">
      <div className="waiting-card">
        <h2>{t("auth.waiting.title")}</h2>
        <Link to="/login">{t("auth.waiting.backToLogin")}</Link>
      </div>
    </div>
  );
};

export default Waiting;

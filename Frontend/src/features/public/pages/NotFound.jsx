import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

export default function NotFound() {
  const { t } = useTranslation();

  return (
    <div className="not-found-container" style={{ textAlign: "center", padding: "100px 20px" }}>
      <h1>{t("public.notFound.title")}</h1>
      <p>{t("public.notFound.desc")}</p>
      <Link to="/" className="btn-primary" style={{ display: "inline-block", marginTop: "20px" }}>
        {t("public.notFound.backHome")}
      </Link>
    </div>
  );
}

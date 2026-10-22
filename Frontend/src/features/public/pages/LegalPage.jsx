import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import "./LegalPage.css";

const PAGE_KEYS = ["privacy", "terms", "deleteData"];

export default function LegalPage({ type }) {
  const { t } = useTranslation();
  const pageKey = PAGE_KEYS.includes(type) ? type : "privacy";
  const list = (name) => {
    const value = t(`legal.${pageKey}.${name}`, { returnObjects: true });
    return Array.isArray(value) ? value : [];
  };

  return (
    <main className="legal-page" data-no-translate="true">
      <section className="legal-document">
        <Link className="legal-back-link" to="/">← {t("navigation.backHome")}</Link>
        <h1>{t(`legal.${pageKey}.title`)}</h1>

        {list("body").map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}

        <ul>
          {list("bullets").map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>

        {list("closing").map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
      </section>
    </main>
  );
}

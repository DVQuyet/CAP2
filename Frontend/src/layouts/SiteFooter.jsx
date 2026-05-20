import { useTranslation } from "react-i18next";

export default function SiteFooter() {
  const { t } = useTranslation();
  return (
    <footer className="site-footer" data-no-translate="true">
      <div className="container footer-wrap">
        <div>
          <h4>{t("layout.brand")}</h4>
          <p>{t("layout.footer.tagline")}</p>
        </div>
        <nav>
          <a href="#">{t("layout.footer.contact")}</a>
          <a href="#">{t("layout.footer.privacy")}</a>
          <a href="#">{t("layout.footer.terms")}</a>
          <a href="#">{t("layout.footer.faq")}</a>
        </nav>
      </div>
    </footer>
  );
}

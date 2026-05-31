import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

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
          <a href="mailto:dinhvietquyet984@gmail.com">{t("layout.footer.contact")}</a>
          <Link to="/privacy-policy">{t("layout.footer.privacy")}</Link>
          <Link to="/terms">{t("layout.footer.terms")}</Link>
          <Link to="/delete-data">Xóa dữ liệu</Link>
        </nav>
      </div>
    </footer>
  );
}

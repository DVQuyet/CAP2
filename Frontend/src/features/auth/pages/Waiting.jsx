import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import "./waiting.css";

const Waiting = () => {
  const { t } = useTranslation();
  return (
    <div className="waiting-page" data-no-translate="true">
      <div className="waiting-card">
        <h2>{t("auth.waiting.title")}</h2>
        <p>
          Tài khoản của bạn đã được tạo. Vui lòng chờ quản trị viên dòng họ
          duyệt quyền truy cập.
        </p>
        <Link to="/login">{t("auth.waiting.backToLogin")}</Link>
      </div>
    </div>
  );
};

export default Waiting;

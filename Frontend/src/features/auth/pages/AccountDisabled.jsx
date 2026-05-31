import { Link, useLocation } from "react-router-dom";
import "./waiting.css";

export default function AccountDisabled() {
  const location = useLocation();
  const message =
    location.state?.message ||
    "Tai khoan cua ban dang bi vo hieu hoa hoac da bi tu choi. Vui long lien he quan tri vien.";

  return (
    <div className="waiting-page" data-no-translate="true">
      <div className="waiting-card waiting-card--danger">
        <h2>Tai khoan khong the dang nhap</h2>
        <p>{message}</p>
        <Link to="/login">Quay lai dang nhap</Link>
      </div>
    </div>
  );
}

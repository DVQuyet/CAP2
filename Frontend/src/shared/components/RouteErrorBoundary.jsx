import { Component } from "react";
import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { routeErrorResetKey } from "../utils/routeError";
import "./StateComponents.css";

function RouteErrorView({ onRetry }) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  // Trang công khai có thanh điều hướng nổi phía trên nên cần chừa chỗ.
  const isPublic = !/^\/(user|manager|dashboard)(\/|$)/.test(pathname);
  return (
    <div className="state-box is-error" role="alert" style={isPublic ? { margin: "120px 16px 48px" } : undefined}>
      <span className="material-symbols-outlined state-icon" aria-hidden="true">error</span>
      <strong className="state-title">{t("common.routeError.title")}</strong>
      <p className="state-hint">{t("common.routeError.hint")}</p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
        <button type="button" className="state-action" onClick={onRetry}>{t("common.states.retry")}</button>
        <Link className="state-action" to="/">{t("common.routeError.home")}</Link>
      </div>
    </div>
  );
}

class Boundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
    this.retry = () => this.setState({ failed: false });
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidUpdate(prevProps) {
    if (this.state.failed && prevProps.resetKey !== this.props.resetKey) this.retry();
  }

  render() {
    return this.state.failed ? <RouteErrorView onRetry={this.retry} /> : this.props.children;
  }
}

// Bắt lỗi render của một trang; layout/thanh điều hướng nằm ngoài nên vẫn còn. Tự reset khi đổi đường dẫn.
export default function RouteErrorBoundary({ children }) {
  const location = useLocation();
  return <Boundary resetKey={routeErrorResetKey(location)}>{children}</Boundary>;
}

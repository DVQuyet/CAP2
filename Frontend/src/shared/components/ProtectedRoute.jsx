import { Navigate, Outlet, useLocation } from "react-router-dom";
import { isAuthenticated, getCurrentUser, getAuthToken, logout } from "../utils/auth";
import { isTokenExpired, buildLoginRedirect } from "../utils/sessionExpiry";

export default function ProtectedRoute({ allowedRoles }) {
  const location = useLocation();

  // Token đã hết hạn từ trước khi mở app: xóa phiên và về đăng nhập (kèm trang định quay lại).
  if (isAuthenticated() && isTokenExpired(getAuthToken())) {
    logout();
    return <Navigate to={buildLoginRedirect(location.pathname, location.search)} replace />;
  }

  if (!isAuthenticated()) {
    return <Navigate to="/" replace />;
  }

  const user = getCurrentUser();
  if (user?.auth_status === "pending" || user?.status === "pending") {
    return <Navigate to="/waiting" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user?.role_name)) {
    return <Navigate to="/" replace />;
  }

  if (Number(user?.profile_completed) === 0 && location.pathname !== "/complete-profile") {
    return <Navigate to="/complete-profile" replace />;
  }

  return <Outlet />;
}

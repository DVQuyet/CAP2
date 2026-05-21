import { Navigate, Outlet, useLocation } from "react-router-dom";
import { isAuthenticated, getCurrentUser } from "../utils/auth";

export default function ProtectedRoute({ allowedRoles }) {
  const location = useLocation();

  if (!isAuthenticated()) {
    return <Navigate to="/" replace />;
  }

  const user = getCurrentUser();
  if (allowedRoles && !allowedRoles.includes(user?.role_name)) {
    return <Navigate to="/" replace />;
  }

  if (Number(user?.profile_completed) === 0 && location.pathname !== "/complete-profile") {
    return <Navigate to="/complete-profile" replace />;
  }

  return <Outlet />;
}

import { Navigate, Outlet } from "react-router-dom";
import { isAuthenticated, getCurrentUser } from "../utils/auth";

export default function ProtectedRoute({ allowedRoles }) {
  if (!isAuthenticated()) {
    return <Navigate to="/" replace />;
  }

  const user = getCurrentUser();
  if (allowedRoles && !allowedRoles.includes(user?.role_name)) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}

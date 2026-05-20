import { lazy, Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import ProtectedRoute from "../shared/components/ProtectedRoute";
import UserLayout from "../layouts/PublicLayout";
import AdminLayout from "../layouts/AdminLayout";
import ManagerLayout from "../layouts/ManagerLayout";
import MemberLayout from "../layouts/MemberLayout";
import Login from "../features/auth/pages/Login";
import Register from "../features/auth/pages/Register";

const Home = lazy(() => import("../features/public/pages/Home"));
const NotFound = lazy(() => import("../features/public/pages/NotFound"));
const FeatureDetailPage = lazy(() => import("../features/public/pages/FeatureDetailPage"));
const BenefitsDetailPage = lazy(() => import("../features/public/pages/BenefitsDetailPage"));
const NewsDetailPage = lazy(() => import("../features/public/pages/NewsDetailPage"));
const GuideDetailPage = lazy(() => import("../features/public/pages/GuideDetailPage"));
const ClanRegister = lazy(() => import("../features/clan/pages/ClanRegister"));
const ForgotPassword = lazy(() => import("../features/auth/pages/ForgotPassword"));
const Waiting = lazy(() => import("../features/auth/pages/Waiting"));

const DashboardHome = lazy(() => import("../features/admin/pages/DashboardHome"));
const GenealogyManagement = lazy(() => import("../features/admin/pages/GenealogyManagement"));
const PostsPage = lazy(() => import("../features/admin/pages/PostsPage"));
const MembersPage = lazy(() => import("../features/admin/pages/MembersPage"));

const AccountPage = lazy(() => import("../features/manager/pages/AccountPage"));
const GenealogySection = lazy(() => import("../features/genealogy/pages/ManagerGenealogy"));
const ManagerDashboard = lazy(() => import("../features/manager/pages/ManagerDashboard"));
const PendingApprovals = lazy(() => import("../features/manager/pages/PendingApprovals"));
const BillingPage = lazy(() => import("../features/billing-payment/pages/BillingPage"));
const ClanFundPage = lazy(() => import("../features/fund/pages/ClanFundPage"));
const MemberFundPage = lazy(() => import("../features/fund/pages/MemberFundPage"));

const FamilyTreePage = lazy(() => import("../features/genealogy/pages/UserFamilyTree"));
const MemberDashboard = lazy(() => import("../features/member/pages/MemberDashboard"));
const MemberProfile = lazy(() => import("../features/member/pages/MemberProfile"));
const MemberSubmissions = lazy(() => import("../features/member/pages/MemberSubmissions"));
const TaskManagementPage = lazy(() => import("../features/events-tasks/pages/TaskManagementPage"));
const GeneralPosts = lazy(() => import("../features/posts/pages/GeneralPosts"));
const TimeCapsulePage = lazy(() => import("../features/time-capsule/pages/TimeCapsulePage"));
const VietnamCalendarPage = lazy(() => import("../features/calendar/pages/VietnamCalendarPage"));

const routeFallback = <div>Loading...</div>;

export default function AppRoutes() {
  return (
    <Suspense fallback={routeFallback}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/clan-register" element={<ClanRegister />} />
        <Route path="/forgot" element={<ForgotPassword />} />
        <Route path="/forgot-password" element={<Navigate to="/forgot" replace />} />
        <Route path="/waiting" element={<Waiting />} />

        {/* Public Routes under UserLayout */}
        <Route element={<UserLayout />}>
          <Route path="/" element={<Home />} />
          <Route path="/tinh-nang" element={<FeatureDetailPage />} />
          <Route path="/loi-ich" element={<BenefitsDetailPage />} />
          <Route path="/tin-tuc" element={<NewsDetailPage />} />
          <Route path="/huong-dan" element={<GuideDetailPage />} />
        </Route>

        {/* Protected Member Portal Routes */}
        <Route element={<ProtectedRoute allowedRoles={["member", "manager", "admin"]} />}>
          <Route element={<MemberLayout />}>
            <Route path="/user/dashboard" element={<MemberDashboard />} />
            <Route path="/user/family-tree" element={<FamilyTreePage />} />
            <Route path="/user/posts" element={<GeneralPosts />} />
            <Route path="/posts/general" element={<GeneralPosts />} />
            <Route path="/user/tasks" element={<TaskManagementPage role="member" />} />
            <Route path="/user/time-capsule" element={<TimeCapsulePage role="member" />} />
            <Route path="/member/tasks/:taskId" element={<Navigate to="/user/tasks" replace />} />
            <Route path="/user/submissions" element={<MemberSubmissions />} />
            <Route path="/user/profile" element={<MemberProfile />} />
            <Route path="/user/fund" element={<MemberFundPage />} />
            <Route path="/user/calendar" element={<VietnamCalendarPage />} />
          </Route>
        </Route>

        {/* Protected Manager Routes */}
        <Route element={<ProtectedRoute allowedRoles={["manager", "admin"]} />}>
          <Route element={<ManagerLayout />}>
            <Route path="/manager" element={<Navigate to="/manager/dashboard" replace />} />
            <Route path="/manager/dashboard" element={<ManagerDashboard />} />
            <Route path="/manager/account" element={<AccountPage />} />
            <Route path="/manager/genealogy" element={<GenealogySection />} />
            <Route path="/manager/tasks" element={<TaskManagementPage role="manager" />} />
            <Route path="/manager/tasks/:taskId" element={<TaskManagementPage role="manager" />} />
            <Route path="/manager/time-capsule" element={<TimeCapsulePage role="manager" />} />
            <Route path="/manager/posts" element={<GeneralPosts />} />
            <Route path="/manager/pending" element={<PendingApprovals />} />
            <Route path="/manager/media" element={<Navigate to="/manager/posts" replace />} />
            <Route path="/manager/billing" element={<BillingPage />} />
            <Route path="/manager/fund" element={<ClanFundPage />} />
            <Route path="/manager/calendar" element={<VietnamCalendarPage />} />
          </Route>
        </Route>

        {/* Protected Admin Routes */}
        <Route element={<ProtectedRoute allowedRoles={["admin"]} />}>
          <Route element={<AdminLayout />}>
            <Route path="/dashboard" element={<DashboardHome />} />
            <Route path="/dashboard/genealogy" element={<GenealogyManagement />} />
            <Route path="/dashboard/posts" element={<PostsPage />} />
            <Route path="/dashboard/posts/clan/:clanId" element={<PostsPage />} />
            <Route path="/dashboard/tasks" element={<TaskManagementPage role="admin" />} />
            <Route path="/dashboard/tasks/clan/:clanId" element={<TaskManagementPage role="admin" />} />
            <Route path="/dashboard/members" element={<MembersPage />} />
            <Route path="/dashboard/events" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard/gallery" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard/billing" element={<BillingPage />} />
            <Route path="/dashboard/calendar" element={<VietnamCalendarPage />} />
          </Route>
        </Route>

        {/* Redirects & 404 */}
        <Route path="/account" element={<Navigate to="/dashboard" replace />} />
        <Route path="/admin" element={<Navigate to="/dashboard" replace />} />
        <Route path="/member" element={<Navigate to="/user/dashboard" replace />} />
        <Route path="/root/user" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}

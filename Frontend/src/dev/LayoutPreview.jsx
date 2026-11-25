// Trang xem thử ba layout (admin, manager, thành viên) với người dùng giả, không cần backend hay đăng nhập.
// Chạy `npx vite --port 5199` rồi mở /dev/layout-preview.html
// Tham số: ?role=admin|manager|member, ?path=<đường dẫn đang chọn>, ?menu=1 mở menu (trên màn hẹp), ?lang=en.
// Không được import từ app chính nên không nằm trong bản build.
/* eslint-disable react-refresh/only-export-components -- trang dev là điểm vào, không export gì nên fast refresh không áp dụng */
import React, { useEffect } from "react";
import ReactDOM from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import "../styles/tokens.css";
import "../index.css";
import "../styles/a11y.css";
import "../app/App.css";
import { i18nReady } from "../i18n/i18n";
import { LanguageProvider } from "../i18n/LanguageContext";
import ConfirmProvider from "../shared/components/ConfirmProvider";
import AdminLayout from "../layouts/AdminLayout";
import ManagerLayout from "../layouts/ManagerLayout";
import MemberLayout from "../layouts/MemberLayout";

const params = new URLSearchParams(window.location.search);
const role = ["admin", "manager", "member"].includes(params.get("role")) ? params.get("role") : "manager";

const ROLES = {
  admin: { Layout: AdminLayout, base: "/dashboard", path: "/dashboard/genealogy", user: { id: 1, role_id: 1, role_name: "admin", name: "Quản trị viên" } },
  manager: { Layout: ManagerLayout, base: "/manager", path: "/manager/genealogy", user: { id: 2, role_id: 2, role_name: "manager", name: "Nguyễn Văn Đức" } },
  member: { Layout: MemberLayout, base: "/user", path: "/user/family-tree", user: { id: 3, role_id: 3, role_name: "member", name: "Nguyễn Thị Hằng" } },
};
const config = ROLES[role];

// Người dùng giả: isAuthenticated() chỉ cần token và auth_user trong localStorage.
localStorage.setItem("auth_user", JSON.stringify({ ...config.user, email: `${role}@example.com`, person_id: config.user.id }));
localStorage.setItem("auth_token", "preview");

// Không có backend: trả rỗng cho mọi request /api để layout không treo ở trạng thái tải.
const realFetch = window.fetch.bind(window);
window.fetch = (input, init) => {
  const url = typeof input === "string" ? input : input?.url || "";
  if (url.includes("/api/")) {
    return Promise.resolve(new Response(JSON.stringify({ success: true, data: [], notifications: [], unread: 0, profile: {} }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
  }
  return realFetch(input, init);
};

function SamplePage() {
  return (
    <div style={{ padding: "1.5rem", borderRadius: 20, background: "var(--color-white)", color: "var(--color-ink-brown-1)", minHeight: 420 }}>
      <h2 style={{ marginTop: 0 }}>Nội dung trang</h2>
      <p>Vùng này giữ chỗ cho nội dung trang, chỉ để xem menu và thanh trên cùng.</p>
    </div>
  );
}

function OpenMenuOnLoad() {
  useEffect(() => {
    if (params.get("menu") !== "1") return undefined;
    const timer = setTimeout(() => document.querySelector(".mobile-sidebar-open")?.click(), 300);
    return () => clearTimeout(timer);
  }, []);
  return null;
}

function Preview() {
  const { Layout } = config;
  const path = params.get("path") || config.path;
  return (
    <LanguageProvider>
      <ConfirmProvider>
        <MemoryRouter initialEntries={[path]}>
          <OpenMenuOnLoad />
          <Routes>
            <Route path={`${config.base}/*`} element={<Layout />}>
              <Route path="*" element={<SamplePage />} />
            </Route>
            <Route path={config.base} element={<Layout />}>
              <Route index element={<SamplePage />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </ConfirmProvider>
    </LanguageProvider>
  );
}

// ?frame=390: vẽ trang trong iframe rộng đúng 390px. Chrome headless không cho cửa sổ hẹp hơn ~500px,
// nên chụp màn hẹp phải đi đường này (layout-shots.sh cắt ảnh về 390x844).
function Framed({ width }) {
  const inner = new URLSearchParams(window.location.search);
  inner.delete("frame");
  return (
    <iframe
      title="layout"
      src={`${window.location.pathname}?${inner.toString()}`}
      style={{ display: "block", width, height: 844, border: 0 }}
    />
  );
}

const frameWidth = Number(params.get("frame")) || 0;
const render = () => ReactDOM.createRoot(document.getElementById("root")).render(
  frameWidth ? <Framed width={frameWidth} /> : <Preview />,
);
if (frameWidth) {
  document.body.style.margin = "0";
  render();
} else {
  i18nReady.then(render, render);
}

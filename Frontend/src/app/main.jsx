import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import AOS from "aos";
import "aos/dist/aos.css";
import App from "./App";
import "../styles/tokens.css";
import "../index.css";
import { i18nReady } from "../i18n/i18n";

// Chạy dev ở máy: nếu còn service worker/caches của bản build (PWA) trên localhost thì gỡ và tải lại,
// để localhost luôn hiện code đang sửa thay vì bản build cũ (vốn gọi backend thật).
if (import.meta.env.DEV && typeof navigator !== "undefined" && "serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations()
    .then(async (registrations) => {
      if (!registrations.length) return;
      await Promise.all(registrations.map((registration) => registration.unregister()));
      if (typeof caches !== "undefined") {
        const keys = await caches.keys();
        await Promise.all(keys.map((key) => caches.delete(key)));
      }
      window.location.reload();
    })
    .catch(() => {});
}

AOS.init({
  duration: 850,
  easing: "ease-out-cubic",
  once: false,
  mirror: true,
  offset: 80,
});

const renderApp = () => ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);

// Chờ bản dịch của ngôn ngữ hiện tại tải xong rồi mới render (tránh nháy khóa dịch).
i18nReady.then(renderApp, renderApp);

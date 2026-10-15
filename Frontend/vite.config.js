import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// Chỉ khi chạy dev: trả /sw.js là một service worker tự gỡ. Trình duyệt từng mở bản build (PWA) trên localhost
// sẽ tự cập nhật sang worker này, xóa bộ nhớ đệm, gỡ đăng ký và tải lại trang -> hiện đúng code đang chạy.
const devServiceWorkerKillSwitch = {
    name: "dev-service-worker-kill-switch",
    apply: "serve",
    configureServer(server) {
        server.middlewares.use("/sw.js", (req, res) => {
            res.setHeader("Content-Type", "application/javascript; charset=utf-8");
            res.setHeader("Cache-Control", "no-store");
            res.end([
                "self.addEventListener('install', () => self.skipWaiting());",
                "self.addEventListener('activate', (event) => {",
                "  event.waitUntil((async () => {",
                "    const keys = await caches.keys();",
                "    await Promise.all(keys.map((key) => caches.delete(key)));",
                "    await self.registration.unregister();",
                "    const clients = await self.clients.matchAll({ type: 'window' });",
                "    clients.forEach((client) => client.navigate(client.url));",
                "  })());",
                "});",
            ].join("\n"));
        });
    },
};

export default defineConfig({
    plugins: [
        devServiceWorkerKillSwitch,
        react(),
        VitePWA({
            registerType: "autoUpdate",
            workbox: {
                cleanupOutdatedCaches: true,
                clientsClaim: true,
                skipWaiting: true,
                navigateFallback: "/index.html",
            },
            manifest: {
                name: "CAP2 - Gia phả Việt",
                short_name: "CAP2",
                description: "Ứng dụng quản lý gia phả, sự kiện, bài viết và quỹ dòng họ.",
                lang: "vi",
                theme_color: "#7c2d12",
                background_color: "#ffffff",
                display: "standalone",
                orientation: "portrait",
                start_url: "/",
                scope: "/",
                icons: [
                    {
                        src: "/icon-192.png",
                        sizes: "192x192",
                        type: "image/png",
                    },
                    {
                        src: "/icon-512.png",
                        sizes: "512x512",
                        type: "image/png",
                    },
                ],
            },
        }),
    ],
    build: {
        rollupOptions: {
            output: {
                // Tách thư viện lớn ra chunk riêng để cache lâu và không nằm trong bundle vào trang đầu.
                manualChunks(id) {
                    if (!id.includes("node_modules")) return undefined;
                    if (/node_modules[\/](recharts|d3-|victory-vendor)/.test(id)) return "vendor-charts";
                    if (/node_modules[\/](react-dom|react-router|react-router-dom|react|scheduler)[\/]/.test(id)) return "vendor-react";
                    if (/node_modules[\/](i18next|react-i18next|i18next-browser-languagedetector)/.test(id)) return "vendor-i18n";
                    return undefined;
                },
            },
        },
    },
    server: {
        proxy: {
            "/api": {
                target: "http://localhost:3000",
                changeOrigin: true,
            },
        },
    },
});

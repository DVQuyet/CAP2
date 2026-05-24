import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
    plugins: [
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
    server: {
        proxy: {
            "/api": {
                target: "http://localhost:3000",
                changeOrigin: true,
            },
        },
    },
});

// Bộ thử trình duyệt CAP2 (S4). Chạy:  cd e2e && npm test   (hoặc ở gốc repo: npm run test:e2e)
// Playwright tự bật 3 tiến trình ở cổng RIÊNG (không dùng lại server đang chạy, tránh nhầm sang DB thật):
//   LLM giả :4010, Backend :3100 (DB lấy từ Backend/.env.local hoặc biến môi trường DB_*), Frontend Vite :5180.
// Trước khi chạy, global-setup.mjs gọi Backend/scripts/e2e-seed.js (tự dừng nếu DB là defaultdb).
import { defineConfig, devices } from "@playwright/test";

const BACKEND_PORT = 3100;
const FRONTEND_PORT = 5180;
const LLM_PORT = 4010;
const FRONTEND_URL = `http://localhost:${FRONTEND_PORT}`;

export default defineConfig({
  testDir: "./tests",
  globalSetup: "./global-setup.mjs",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: FRONTEND_URL,
    locale: "vi-VN",
    viewport: { width: 1280, height: 800 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } }],
  webServer: [
    {
      command: "node fake-llm.mjs",
      url: `http://127.0.0.1:${LLM_PORT}/health`,
      reuseExistingServer: false,
      env: { ...process.env, FAKE_LLM_PORT: String(LLM_PORT) },
    },
    {
      command: "node server.js",
      cwd: "../Backend",
      url: `http://localhost:${BACKEND_PORT}/api/health`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        ...process.env,
        NODE_ENV: "development",
        PORT: String(BACKEND_PORT),
        FRONTEND_URL,
        DISABLE_BACKGROUND_JOBS: "true",
        JWT_SECRET: process.env.JWT_SECRET || "e2e-local-secret",
        GROQ_API_KEY: "e2e-fake-key",
        GROQ_BASE_URL: `http://127.0.0.1:${LLM_PORT}`,
        GROQ_MODEL: "fake-model",
        GROQ_FALLBACK_MODELS: "fake-model",
      },
    },
    {
      command: `npx vite --port ${FRONTEND_PORT} --strictPort`,
      cwd: "../Frontend",
      url: FRONTEND_URL,
      reuseExistingServer: false,
      timeout: 120_000,
      env: { ...process.env, VITE_API_BASE_URL: `http://localhost:${BACKEND_PORT}` },
    },
  ],
});

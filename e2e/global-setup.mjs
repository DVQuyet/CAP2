// Tạo lại dữ liệu thử trước mỗi lần chạy. e2e-seed.js tự dừng nếu DB là defaultdb hoặc DB_NAME trống.
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

export default function globalSetup() {
  execFileSync(process.execPath, ["scripts/e2e-seed.js"], { cwd: path.join(here, "..", "Backend"), stdio: "inherit" });
}

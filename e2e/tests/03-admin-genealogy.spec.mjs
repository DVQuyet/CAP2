// Luồng 4: trang "Quản lý gia phả" của admin. Lỗi 15/11: biến dùng trước khi khai báo làm trang sập ngay khi mở.
import { test, expect } from "@playwright/test";
import { accounts, loginAs, trackPageErrors, expectPageHealthy } from "./helpers.mjs";

test("admin mở trang quản lý gia phả, thấy dòng họ thử và cây của nó", async ({ page }) => {
  const errors = trackPageErrors(page);
  await loginAs(page, "admin");
  await page.goto("/dashboard/genealogy");
  const clan = page.getByText(accounts.clanName).first();
  await expect(clan).toBeVisible();
  await clan.click();
  await expect(page.getByText("Trần Văn Tổ").first()).toBeVisible();
  await expectPageHealthy(page, errors);
});

// Luồng 1: đăng nhập ba vai trò, mỗi vai trò vào đúng trang chủ của mình và trang không sập.
import { test, expect } from "@playwright/test";
import { accounts, loginAs, trackPageErrors, expectPageHealthy } from "./helpers.mjs";

for (const role of ["admin", "manager", "member"]) {
  test(`đăng nhập ${role} vào đúng trang chủ`, async ({ page }) => {
    const errors = trackPageErrors(page);
    await loginAs(page, role);
    await expect(page.locator("body")).not.toBeEmpty();
    await expectPageHealthy(page, errors);
    const token = await page.evaluate(() => localStorage.getItem("auth_token"));
    expect(token, "phải lưu token sau khi đăng nhập").toBeTruthy();
  });
}

test("sai mật khẩu thì ở lại trang đăng nhập", async ({ page }) => {
  await page.goto("/login");
  await page.locator('input[name="email"]').fill(accounts.member.email);
  await page.locator('input[name="password"]').fill("sai-mat-khau");
  await page.locator('button[type="submit"]').click();
  await expect(page.getByText(/không chính xác/i)).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});

// Luồng 2–3: mở cây gia phả và bật/tắt toàn màn hình.
// Lỗi 15/11: khung cây không "position: fixed" khi toàn màn hình nên trang bị khoá cuộn, nhìn như đứng.
import { test, expect } from "@playwright/test";
import { loginAs, trackPageErrors, expectPageHealthy } from "./helpers.mjs";

const SEEDED_NAMES = ["Trần Văn Tổ", "Trần Văn Quản", "Trần Thị Mai", "Trần Văn Nam"];

test("thành viên mở cây thấy người trong dòng họ", async ({ page }) => {
  const errors = trackPageErrors(page);
  await loginAs(page, "member");
  await page.goto("/user/family-tree");
  const names = page.locator(".fte-cardName");
  await expect(names.first()).toBeVisible();
  for (const name of SEEDED_NAMES) {
    await expect(names.filter({ hasText: name }).first()).toBeAttached();
  }
  await expectPageHealthy(page, errors);
});

// Lỗi đã biết (25/11): ở 1280x800 nút tròn của khung chat AI (.ai-chat-widget) đè lên nút "Toàn màn hình" ở góc dưới
// phải, bấm chuột không tới. test.fail(): khi giao diện được sửa, test này "đạt ngoài dự kiến" và Playwright báo để gỡ dòng fail.
test("nút toàn màn hình không bị khung chat AI che", async ({ page }) => {
  test.fail(true, "Khung chat AI đè nút toàn màn hình ở 1280x800 (VIEC_CHUA_LAM, đợt 25/11)");
  await loginAs(page, "member");
  await page.goto("/user/family-tree");
  await expect(page.locator(".fte-cardName").first()).toBeVisible();
  await page.getByRole("button", { name: "Toàn màn hình", exact: true }).click({ timeout: 5_000 });
});

test("toàn màn hình phủ kín cửa sổ, thoát được, trang không bị khoá", async ({ page }) => {
  const errors = trackPageErrors(page);
  await loginAs(page, "member");
  await page.goto("/user/family-tree");
  await expect(page.locator(".fte-cardName").first()).toBeVisible();

  // Bấm bằng bàn phím để không phụ thuộc lỗi bị che ở test trên.
  await page.getByRole("button", { name: "Toàn màn hình", exact: true }).focus();
  await page.keyboard.press("Enter");
  const shell = page.locator(".fte-shell.is-fullscreen");
  await expect(shell).toBeVisible();
  const box = await shell.evaluate((el) => {
    const rect = el.getBoundingClientRect();
    return { position: getComputedStyle(el).position, top: rect.top, left: rect.left, width: rect.width, height: rect.height };
  });
  expect(box.position).toBe("fixed");
  expect(Math.abs(box.top)).toBeLessThan(2);
  expect(Math.abs(box.left)).toBeLessThan(2);
  expect(box.width).toBeGreaterThan(1270);
  expect(box.height).toBeGreaterThan(790);

  // Nút thoát phải bấm được (không bị lớp khác che) và trang trở lại bình thường.
  await page.getByRole("button", { name: "Thoát toàn màn hình" }).click();
  await expect(page.locator(".fte-shell.is-fullscreen")).toHaveCount(0);
  await expect(page.locator("body.fte-bodyFullscreen")).toHaveCount(0);

  // Bật lại rồi thoát bằng phím Esc.
  await page.getByRole("button", { name: "Toàn màn hình", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".fte-shell.is-fullscreen")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".fte-shell.is-fullscreen")).toHaveCount(0);
  await expectPageHealthy(page, errors);
});

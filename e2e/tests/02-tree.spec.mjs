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

// Ở 1280x800 nút tròn của khung chat AI (.ai-chat-widget) từng đè nút "Toàn màn hình" ở góc dưới phải (sửa 25/11:
// cụm zoom được nâng lên khi trang có khung chat, xem TreeToolbar.css). Bấm chuột thật để chặn lỗi quay lại.
test("nút toàn màn hình không bị khung chat AI che", async ({ page }) => {
  await loginAs(page, "member");
  await page.goto("/user/family-tree");
  await expect(page.locator(".fte-cardName").first()).toBeVisible();
  await page.getByRole("button", { name: "Toàn màn hình", exact: true }).click({ timeout: 5_000 });
});

// Điện thoại 390x844 có khung chat: nút (+) và cụm zoom gọn từng cùng ở bottom 84px, (+) z-index 40 che nút Toàn màn hình.
test.describe("điện thoại 390x844", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test("nút toàn màn hình không bị nút (+) hay khung chat che", async ({ page }) => {
    const errors = trackPageErrors(page);
    await loginAs(page, "member");
    await page.goto("/user/family-tree");
    await expect(page.locator(".fte-cardName").first()).toBeAttached();
    const fullscreen = page.getByRole("button", { name: "Toàn màn hình", exact: true });
    await expect(fullscreen).toBeVisible();
    const fab = page.locator(".fte2-speedDial");
    if (await fab.count()) {
      const [zoomBox, fabBox] = await Promise.all([page.locator(".fte2-zoom").boundingBox(), fab.boundingBox()]);
      const overlaps = zoomBox && fabBox && zoomBox.y < fabBox.y + fabBox.height && fabBox.y < zoomBox.y + zoomBox.height
        && zoomBox.x < fabBox.x + fabBox.width && fabBox.x < zoomBox.x + zoomBox.width;
      expect(overlaps, `zoom ${JSON.stringify(zoomBox)} đè nút (+) ${JSON.stringify(fabBox)}`).toBeFalsy();
    }
    await fullscreen.click({ timeout: 5_000 });
    await expect(page.locator(".fte-shell.is-fullscreen")).toBeVisible();
    await expectPageHealthy(page, errors);
  });
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

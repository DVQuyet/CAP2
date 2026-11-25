// Luồng 5: "AI điền form sự kiện" của manager, với LLM giả (fake-llm.mjs) thay cho Groq.
// Lỗi 15/11: câu trả lời bị cắt / 429 làm AI báo không hỗ trợ. Ở đây kiểm cả đường gọi đầy đủ: giao diện → backend → LLM → form.
import { test, expect } from "@playwright/test";
import { loginAs, trackPageErrors, expectPageHealthy } from "./helpers.mjs";

const FAKE_EVENT_TITLE = "Giỗ tổ họ Trần (AI giả)";

test("manager nhờ AI điền form sự kiện, form có tiêu đề và đủ số công việc", async ({ page }) => {
  const errors = trackPageErrors(page);
  await loginAs(page, "manager");
  await page.goto("/manager/tasks");

  await page.locator(".event-toolbar-actions button").filter({ hasText: "auto_awesome" }).click();
  const modal = page.locator(".ai-event-modal");
  await expect(modal).toBeVisible();
  await modal.locator("textarea").fill("Tổ chức giỗ tổ họ Trần vào tháng 12");
  await modal.locator('input[type="number"]').fill("4");

  const responsePromise = page.waitForResponse((res) => res.url().includes("/api/ai/event-form/generate"));
  await modal.locator(".task-btn-primary").click();
  const response = await responsePromise;
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body.event.title).toBe(FAKE_EVENT_TITLE);
  expect(body.manager_tasks).toHaveLength(4);

  // Form "Thêm sự kiện" mở sẵn với tiêu đề AI điền; lưu thì sự kiện hiện trong danh sách.
  await expect(modal).toHaveCount(0);
  const titleInput = page.locator("#create-event-title").locator("xpath=ancestor::form[1]").locator("input").first();
  await expect(titleInput).toHaveValue(FAKE_EVENT_TITLE);
  await titleInput.locator("xpath=ancestor::form[1]").locator('button[type="submit"]').click();
  await expect(page.getByText(FAKE_EVENT_TITLE).first()).toBeVisible();
  await expectPageHealthy(page, errors);
});

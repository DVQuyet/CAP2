import { createRequire } from "node:module";
import { expect } from "@playwright/test";

const require = createRequire(import.meta.url);
export const accounts = require("../accounts.json");

export const HOME_BY_ROLE = { admin: "/dashboard", manager: "/manager/dashboard", member: "/user/dashboard" };

// Ghi lại lỗi JavaScript chưa bắt trên trang: lỗi kiểu 15/11 (trang sập khi mở) hiện ra ở đây.
export function trackPageErrors(page) {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

export async function expectPageHealthy(page, errors) {
  await expect(page.getByText("Trang này gặp sự cố")).toHaveCount(0);
  expect(errors, `Lỗi JavaScript trên trang: ${errors.join(" | ")}`).toEqual([]);
}

export async function loginAs(page, role) {
  await page.goto("/login");
  await page.locator('input[name="email"]').fill(accounts[role].email);
  await page.locator('input[name="password"]').fill(accounts.password);
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(new RegExp(`${HOME_BY_ROLE[role].replace(/\//g, "\\/")}(\\?|$)`));
}

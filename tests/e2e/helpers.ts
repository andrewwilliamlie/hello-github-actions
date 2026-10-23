import { expect, type Page } from "@playwright/test";
import { authenticator } from "otplib";
import { DEMO_PASSWORD, DEMO_TOTP } from "../../prisma/seed-constants";

export async function login(page: Page, email: string, password = DEMO_PASSWORD) {
  await page.goto("/login");
  await page.getByLabel(/Email atau nomor ponsel|Email or phone/).fill(email);
  await page.getByLabel(/Kata sandi|Password/).fill(password);
  await page.getByRole("button", { name: /^Masuk$|^Sign in$/ }).click();
  if (DEMO_TOTP[email]) {
    await page.waitForURL(/\/login\/mfa/);
    await page.getByLabel(/Kode|Code/).fill(authenticator.generate(DEMO_TOTP[email]));
    await page.getByRole("button", { name: /Verifikasi|Verify/ }).click();
    await page.waitForURL(/\/admin/);
  } else {
    await page.waitForURL((u) => !u.pathname.startsWith("/login"));
  }
}

export async function logout(page: Page) {
  await page.context().clearCookies();
}

/** Click a button that opens a confirm dialog, optionally fill reason/input, then confirm. */
export async function confirmAction(page: Page, name: RegExp | string, opts: { reason?: string; input?: string; scope?: ReturnType<Page["locator"]> } = {}) {
  const root = opts.scope ?? page;
  await root.getByRole("button", { name }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  if (opts.input !== undefined) await dialog.locator("#action-input").fill(opts.input);
  if (opts.reason !== undefined) await dialog.locator("#action-reason").fill(opts.reason);
  await dialog.locator("button[type=submit]").click();
  await expect(dialog).toBeHidden();
}

export async function expectToast(page: Page, text: RegExp | string) {
  await expect(page.locator("[data-sonner-toast]").filter({ hasText: text }).first()).toBeVisible();
}

export const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");

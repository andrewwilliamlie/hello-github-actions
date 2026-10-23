import { test, expect } from "@playwright/test";
import { PNG, login } from "./helpers";

test("visitor registers as an agent from the landing page and starts onboarding", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Agen EDC Hausjo");
  await expect(page.getByText(/bukan jaminan penghasilan/i).first()).toBeVisible();
  await page.getByRole("link", { name: "Jadi Agen Hausjo" }).first().click();
  await expect(page).toHaveURL(/\/register/);

  const email = `e2e.agent.${Date.now()}@test.local`;
  await page.locator("#fullName").fill("Agen Uji Coba");
  await page.locator("#phone").fill(`0819${String(Date.now()).slice(-8)}`);
  await page.locator("#email").fill(email);
  await page.locator("#password").fill("RahasiaUji123");
  await page.locator("#addressLine").fill("Jl. Uji Coba No. 1");
  await page.locator("#city").fill("Bandung");
  await page.locator("#province").selectOption("Jawa Barat");
  await page.locator("#bankCode").selectOption("014");
  await page.locator("#accountHolderName").fill("Agen Uji Coba");
  await page.locator("#accountNumber").fill(`88${String(Date.now()).slice(-8)}`);
  await page.getByRole("button", { name: "Kirim OTP" }).click();
  const otp = await page.getByTestId("mock-otp").textContent();
  expect(otp).toMatch(/^\d{6}$/);
  await page.locator("#otpCode").fill(otp!);
  for (const cb of await page.locator("input[type=checkbox]").all()) await cb.check();
  await page.getByRole("button", { name: "Daftar sekarang" }).click();

  await expect(page).toHaveURL(/\/login\?registered=1/);
  await expect(page.getByText("Pendaftaran berhasil")).toBeVisible();
  await login(page, email, "RahasiaUji123");
  await expect(page).toHaveURL(/\/agent$/);
  await expect(page.getByText(/menunggu persetujuan/i).first()).toBeVisible();

  await page.getByRole("link", { name: "Onboarding" }).first().click();
  await page.locator("#idNumber").fill("3273010101900001");
  await page.locator("#idCard").setInputFiles({ name: "ktp.png", mimeType: "image/png", buffer: PNG });
  await page.locator("#selfie").setInputFiles({ name: "selfie.png", mimeType: "image/png", buffer: PNG });
  await page.getByRole("button", { name: "Kirim untuk verifikasi" }).click();
  await expect(page.getByText("KTP sedang ditinjau tim Hausjo.")).toBeVisible();
  await expect(page.getByText("Perjanjian versi terbaru telah Anda terima.")).toBeVisible();
});

test("referral link pre-fills the referral code", async ({ page }) => {
  await page.goto("/r/demoa1xz");
  await expect(page).toHaveURL(/\/register\?ref=DEMOA1XZ/);
  await expect(page.getByText(/Anda diundang oleh/)).toBeVisible();
  await expect(page.locator("#referralCode")).toHaveValue("DEMOA1XZ");
});

import { test, expect } from "@playwright/test";
import { login, logout, confirmAction, expectToast } from "./helpers";

test.describe.serial("admin journeys", () => {
  test("operations verifies KYC + bank and approves the pending agent", async ({ page }) => {
    await login(page, "ops@hausjo.test");
    await page.goto("/admin/agents?status=PENDING");
    await page.getByRole("link", { name: "Andi Pratama" }).click();
    await confirmAction(page, "Verifikasi KTP");
    await expectToast(page, "KYC ditinjau");
    await confirmAction(page, /^Verifikasi$/);
    await expectToast(page, "Rekening ditinjau");
    await confirmAction(page, "Setujui agen");
    await expectToast(page, "Status agen diperbarui");
    await expect(page.getByText("Aktif", { exact: true }).first()).toBeVisible();
  });

  test("operations approves a submitted merchant application", async ({ page }) => {
    await login(page, "ops@hausjo.test");
    await page.getByRole("link", { name: /Antrean aplikasi/ }).click();
    await page.getByRole("link", { name: /Toko Roti Harum/ }).click();
    await confirmAction(page, "Setujui merchant");
    await expectToast(page, "Aplikasi diperbarui");
    await expect(page.getByRole("link", { name: /Buka merchant HJM-/ })).toBeVisible();
  });

  test("finance pays a withdrawal through maker-checker", async ({ page }) => {
    await login(page, "finance@hausjo.test");
    await page.goto("/admin/withdrawals");
    await confirmAction(page, "Setujui");
    await expectToast(page, "Penarikan ditinjau");
    await page.getByLabel("Pilih semua").check();
    await confirmAction(page, "Buat batch pembayaran", { reason: "Batch E2E" });
    await expect(page).toHaveURL(/\/admin\/payouts\/[a-z0-9]+$/);
    await expect(page.getByText(/Anda adalah maker batch ini/)).toBeVisible();
    const batchUrl = page.url();

    await logout(page);
    await login(page, "finance2@hausjo.test");
    await page.goto(batchUrl);
    await confirmAction(page, "Setujui batch (checker)");
    await expectToast(page, "Batch disetujui");
    await page.getByLabel("Nomor referensi bank").fill(`E2E-BCA-${Date.now()}`);
    await page.getByRole("button", { name: "Catat transfer telah dilakukan" }).click();
    await expectToast(page, "Transfer dicatat");
    await expect(page.getByText(/Konfirmasi harus oleh pengguna lain/)).toBeVisible();

    await logout(page);
    await login(page, "finance@hausjo.test");
    await page.goto(batchUrl);
    await confirmAction(page, "Konfirmasi dengan mutasi bank");
    await expectToast(page, "Pembayaran terkonfirmasi");
    await expect(page.getByText("Dibayar").first()).toBeVisible();
  });

  test("finance reviews reconciliation exceptions and exports a report", async ({ page }) => {
    await login(page, "finance@hausjo.test");
    await page.goto("/admin/reconciliation");
    await expect(page.getByText(/Antrean pengecualian/)).toBeVisible();
    await confirmAction(page, "Terima dengan pengecualian", { reason: "Prosesor mengonfirmasi selisih via email" });
    await expectToast(page, "Pengecualian diperbarui");
    await page.goto("/admin/reports");
    const download = page.waitForEvent("download");
    await page.getByRole("link", { name: "CSV" }).first().click();
    expect((await download).suggestedFilename()).toMatch(/hausjo-agents-.*\.csv/);
  });

  test("operations cannot reach finance-only pages", async ({ page }) => {
    await login(page, "ops@hausjo.test");
    await page.goto("/admin/payouts");
    await expect(page).toHaveURL(/\/admin\?forbidden=1/);
  });

  test("dashboard renders analytics", async ({ page }) => {
    await login(page, "superadmin@hausjo.test");
    await expect(page.getByText("Kewajiban komisi bruto")).toBeVisible();
    await expect(page.getByText("Corong aktivasi merchant")).toBeVisible();
    await expect(page.getByText(/aturan komisi DEMO masih aktif/)).toBeVisible();
  });
});

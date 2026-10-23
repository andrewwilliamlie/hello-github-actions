import { test, expect } from "@playwright/test";
import { PNG, login, confirmAction, expectToast } from "./helpers";

test.describe("agent journey (budi@agent.test)", () => {
  test.beforeEach(async ({ page }) => login(page, "budi@agent.test"));

  test("dashboard shows earnings, balances, charts and referral share", async ({ page }) => {
    await expect(page.getByRole("heading", { name: /Halo, Budi/ })).toBeVisible();
    for (const label of ["Total pendapatan", "Tertunda", "Dapat ditarik", "Sudah dibayar", "Merchant aktif", "Imbalan referral"]) {
      await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
    }
    await expect(page.getByText("Tren pendapatan")).toBeVisible();
    await expect(page.getByTestId("referral-code").first()).toHaveText(/[A-Z0-9]{8}/);
    await expect(page.getByRole("link", { name: /WhatsApp/ }).first()).toHaveAttribute("href", /wa\.me/);
  });

  test("creates a merchant lead, uploads documents and submits the application", async ({ page }) => {
    await page.getByRole("link", { name: "Daftarkan merchant" }).first().click();
    await page.locator("#businessName").fill(`Warung E2E ${Date.now()}`);
    await page.locator("#businessType").fill("Warung");
    await page.locator("#ownerName").fill("Pak E2E");
    await page.locator("#phone").fill(`0857${String(Date.now()).slice(-8)}`);
    await page.locator("#productId").selectOption({ label: "PAX A920 Pro" });
    await page.locator("#addressLine").fill("Jl. Pengujian No. 9");
    await page.locator("#city").fill("Bandung");
    await page.locator("#province").selectOption("Jawa Barat");
    await page.getByRole("button", { name: "Buat lead merchant" }).click();
    await expect(page).toHaveURL(/\/agent\/merchants\/[a-z0-9]+$/);

    for (const [type, name] of [["OWNER_ID_CARD", "ktp.png"], ["STORE_PHOTO", "toko.png"]]) {
      await page.locator("#type").selectOption(type);
      await page.locator("#file").setInputFiles({ name, mimeType: "image/png", buffer: PNG });
      await page.getByRole("button", { name: "Unggah" }).click();
      await expectToast(page, "Dokumen diunggah");
    }
    await confirmAction(page, "Ajukan aplikasi");
    await expect(page.getByText("Aplikasi diajukan").first()).toBeVisible();
  });

  test("opens an explainable commission", async ({ page }) => {
    await page.getByRole("link", { name: "Pendapatan" }).first().click();
    await page.locator("select[name=type]").selectOption("SALES");
    await page.getByRole("button", { name: "Terapkan" }).click();
    await page.getByRole("link", { name: "Komisi penjualan" }).first().click();
    await expect(page.getByText("Rincian perhitungan").first()).toBeVisible();
    await expect(page.getByText("Rumus")).toBeVisible();
    await expect(page.getByText(/SALES:[A-Z0-9-]+ v1/).first()).toBeVisible();
    await expect(page.getByText("Jejak buku besar")).toBeVisible();
  });

  test("requests a withdrawal with an idempotent form", async ({ page }) => {
    await page.getByRole("link", { name: "Dompet" }).first().click();
    await page.locator("#amount").fill("100000");
    await page.getByRole("button", { name: "Ajukan penarikan" }).click();
    await expectToast(page, "Permintaan penarikan dibuat");
    await expect(page.getByText(/menunggu peninjauan/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Ajukan penarikan" })).toBeDisabled();
  });

  test("referral page shows the network tree and direct-only rule", async ({ page }) => {
    await page.getByRole("link", { name: "Referral" }).first().click();
    await expect(page.getByText("Pohon jaringan")).toBeVisible();
    await expect(page.getByText("Siti Rahmawati").first()).toBeVisible();
    await expect(page.getByText(/hanya dibayarkan untuk rekrutan langsung/).first()).toBeVisible();
  });

  test("agent cannot open the admin console", async ({ page }) => {
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/login\?denied=1/);
  });
});

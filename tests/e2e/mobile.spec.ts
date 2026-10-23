import { test, expect } from "@playwright/test";
import { login } from "./helpers";

test("agent portal is usable on a phone (menu + no horizontal scroll)", async ({ page }) => {
  await login(page, "siti@agent.test");
  await page.getByRole("button", { name: "Buka menu" }).click();
  await page.getByRole("link", { name: "Dompet" }).click();
  await expect(page).toHaveURL(/\/agent\/wallet/);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

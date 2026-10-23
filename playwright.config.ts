import { defineConfig, devices } from "@playwright/test";
import { E2E_ENV } from "./tests/e2e/env";

/**
 * E2E runs against a production build (`npm run build` first) on port 3100 with an isolated,
 * freshly seeded database (hausjo_e2e) created by the global setup.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  globalSetup: "./tests/e2e/global-setup.ts",
  use: { baseURL: "http://localhost:3100", trace: "retain-on-failure", screenshot: "only-on-failure", locale: "id-ID", timezoneId: "Asia/Jakarta" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1366, height: 900 } }, testIgnore: /mobile\.spec\.ts/ },
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: /mobile\.spec\.ts/ },
  ],
  webServer: {
    command: "npx next start -p 3100",
    url: "http://localhost:3100/login",
    reuseExistingServer: false,
    timeout: 120_000,
    env: E2E_ENV,
  },
});

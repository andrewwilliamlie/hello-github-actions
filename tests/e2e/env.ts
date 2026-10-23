import { readFileSync, existsSync } from "node:fs";

const fromDotEnv: Record<string, string> = {};
if (existsSync(".env")) {
  for (const line of readFileSync(".env", "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) fromDotEnv[m[1]] = m[2].replace(/^"(.*)"$/, "$1");
  }
}

export const E2E_DB = process.env.E2E_DATABASE_URL ?? "postgresql://hausjo:hausjo@localhost:5432/hausjo_e2e?schema=public";

export const E2E_ENV: Record<string, string> = {
  ...fromDotEnv,
  NODE_ENV: "production",
  ALLOW_MOCK_PROVIDERS: "true", // E2E uses the mock SMS provider; never set this in real production
  E2E_EXPOSE_MOCK_OTP: "true",
  DATABASE_URL: E2E_DB,
  APP_URL: "http://localhost:3100",
  STORAGE_LOCAL_DIR: "./storage-e2e",
  DEMO_MODE: "true",
  FIELD_ENCRYPTION_KEY: fromDotEnv.FIELD_ENCRYPTION_KEY ?? Buffer.alloc(32, 3).toString("base64"),
  BLIND_INDEX_KEY: fromDotEnv.BLIND_INDEX_KEY ?? Buffer.alloc(32, 4).toString("base64"),
  OTP_PEPPER: fromDotEnv.OTP_PEPPER ?? "e2e-pepper-0123456789",
};

export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgresql://hausjo:hausjo@localhost:5432/hausjo_test?schema=public";

export const TEST_ENV: Record<string, string> = {
  NODE_ENV: "test",
  DATABASE_URL: TEST_DATABASE_URL,
  FIELD_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
  BLIND_INDEX_KEY: Buffer.alloc(32, 9).toString("base64"),
  OTP_PEPPER: "test-pepper-0123456789",
  STORAGE_DRIVER: "local",
  STORAGE_LOCAL_DIR: "./storage-test",
  ADMIN_MFA_REQUIRED: "true",
};

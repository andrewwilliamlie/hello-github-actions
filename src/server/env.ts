import "server-only";
import { z } from "zod";

const bool = z.enum(["true", "false"]).default("false").transform((v) => v === "true");

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1),
  APP_URL: z.string().url().default("http://localhost:3000"),
  FIELD_ENCRYPTION_KEY: z.string().min(1, "FIELD_ENCRYPTION_KEY (32 bytes, base64) is required"),
  BLIND_INDEX_KEY: z.string().min(1, "BLIND_INDEX_KEY (base64) is required"),
  OTP_PEPPER: z.string().min(16),
  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  STORAGE_LOCAL_DIR: z.string().default("./storage"),
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default("ap-southeast-3"),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_FORCE_PATH_STYLE: bool,
  S3_SSE: z.enum(["AES256", "aws:kms", "none"]).default("AES256"), // server-side encryption; "none" for MinIO without KMS
  SMS_PROVIDER: z.enum(["mock"]).default("mock"),
  EMAIL_PROVIDER: z.enum(["mock", "smtp"]).default("mock"),
  SMTP_URL: z.string().optional(),
  EMAIL_FROM: z.string().default("Hausjo Agent Network <no-reply@hausjo.example>"),
  WHATSAPP_PROVIDER: z.enum(["mock", "cloud_api"]).default("mock"),
  WHATSAPP_API_URL: z.string().optional(),
  WHATSAPP_ACCESS_TOKEN: z.string().optional(),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  MALWARE_SCANNER: z.enum(["none", "clamav"]).default("none"),
  CLAMAV_HOST: z.string().default("localhost"),
  CLAMAV_PORT: z.coerce.number().default(3310),
  ADMIN_MFA_REQUIRED: z.enum(["true", "false"]).default("true").transform((v) => v === "true"),
  ALLOW_MOCK_PROVIDERS: bool,
  DEMO_MODE: bool,
  SECURE_COOKIES: z.enum(["auto", "true", "false"]).default("auto"),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid environment configuration: ${issues}`);
  }
  const e = parsed.data;
  if (e.NODE_ENV === "production" && !e.ALLOW_MOCK_PROVIDERS) {
    const mocks = [
      e.SMS_PROVIDER === "mock" && "SMS_PROVIDER",
      e.EMAIL_PROVIDER === "mock" && "EMAIL_PROVIDER",
      e.WHATSAPP_PROVIDER === "mock" && "WHATSAPP_PROVIDER",
      e.MALWARE_SCANNER === "none" && "MALWARE_SCANNER",
    ].filter(Boolean);
    if (mocks.length) {
      throw new Error(`Mock providers are not allowed in production: ${mocks.join(", ")}. Configure real providers or set ALLOW_MOCK_PROVIDERS=true for a staging environment.`);
    }
  }
  cached = e;
  return e;
}

/**
 * True when the mock SMS provider may reveal OTP codes in the UI: outside production, or in an
 * E2E production build that explicitly opts in (requires ALLOW_MOCK_PROVIDERS as well).
 */
export function isMockMode(): boolean {
  const e = env();
  if (e.SMS_PROVIDER !== "mock") return false;
  if (e.NODE_ENV !== "production") return true;
  return e.ALLOW_MOCK_PROVIDERS && process.env.E2E_EXPOSE_MOCK_OTP === "true";
}

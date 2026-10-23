export type ErrorCode =
  | "UNAUTHENTICATED"
  | "MFA_REQUIRED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION"
  | "CONFLICT"
  | "DUPLICATE"
  | "BUSINESS_RULE"
  | "INSUFFICIENT_BALANCE"
  | "RATE_LIMITED"
  | "MAKER_CHECKER";

const HTTP: Record<ErrorCode, number> = {
  UNAUTHENTICATED: 401,
  MFA_REQUIRED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION: 422,
  CONFLICT: 409,
  DUPLICATE: 409,
  BUSINESS_RULE: 422,
  INSUFFICIENT_BALANCE: 422,
  RATE_LIMITED: 429,
  MAKER_CHECKER: 403,
};

/** Expected, user-presentable error. `message` is safe to show (Bahasa Indonesia by default). */
export class AppError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "AppError";
  }
  get status() {
    return HTTP[this.code];
  }
}

export const forbidden = (msg = "Anda tidak memiliki akses untuk tindakan ini.") => new AppError("FORBIDDEN", msg);
export const notFound = (what = "Data") => new AppError("NOT_FOUND", `${what} tidak ditemukan.`);
export const rule = (msg: string, details?: Record<string, unknown>) => new AppError("BUSINESS_RULE", msg, details);
export const conflict = (msg: string) => new AppError("CONFLICT", msg);
export const duplicate = (msg: string) => new AppError("DUPLICATE", msg);
export const invalid = (msg: string, details?: Record<string, unknown>) => new AppError("VALIDATION", msg, details);

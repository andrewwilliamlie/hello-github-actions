import "server-only";
import { hash, verify } from "@node-rs/argon2";
import { z } from "zod";

// Argon2id with OWASP-recommended minimums (m=19 MiB, t=2, p=1).
const OPTS = { memoryCost: 19_456, timeCost: 2, parallelism: 1, outputLen: 32 } as const;

export const passwordSchema = z
  .string()
  .min(10, "Kata sandi minimal 10 karakter")
  .max(128)
  .regex(/[A-Za-z]/, "Kata sandi harus mengandung huruf")
  .regex(/\d/, "Kata sandi harus mengandung angka");

export function hashPassword(password: string): Promise<string> {
  return hash(password, { ...OPTS, algorithm: 2 });
}

export async function verifyPassword(stored: string, password: string): Promise<boolean> {
  try {
    return await verify(stored, password);
  } catch {
    return false;
  }
}

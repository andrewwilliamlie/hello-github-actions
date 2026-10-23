import "server-only";
import { authenticator } from "otplib";
import QRCode from "qrcode";
import { decryptField, encryptField } from "../crypto";

authenticator.options = { window: 1, step: 30, digits: 6 };

export function generateMfaSecret(): string {
  return authenticator.generateSecret(20);
}

export function encryptMfaSecret(secret: string): string {
  return encryptField(secret);
}

export function verifyTotp(secretEnc: string, code: string): boolean {
  const secret = decryptField(secretEnc);
  return authenticator.check(code.replace(/\s/g, ""), secret);
}

export async function mfaQrDataUrl(email: string, secret: string): Promise<string> {
  const uri = authenticator.keyuri(email, "Hausjo Agent Network", secret);
  return QRCode.toDataURL(uri, { margin: 1, width: 220 });
}

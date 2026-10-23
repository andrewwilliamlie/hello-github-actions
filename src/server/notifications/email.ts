import "server-only";
import { env } from "../env";

export interface EmailMessage { to: string; subject: string; text: string }
export interface EmailProvider {
  readonly name: string;
  readonly isMock: boolean;
  send(msg: EmailMessage): Promise<{ messageId: string | null }>;
}

/** MOCK — nothing leaves the server; the delivery row is visible in Admin → Notifications. */
class MockEmailProvider implements EmailProvider {
  readonly name = "mock-email";
  readonly isMock = true;
  async send() {
    return { messageId: null };
  }
}

class SmtpEmailProvider implements EmailProvider {
  readonly name = "smtp";
  readonly isMock = false;
  async send(msg: EmailMessage) {
    const nodemailer = await import("nodemailer");
    const url = env().SMTP_URL;
    if (!url) throw new Error("SMTP_URL is not configured");
    const transport = nodemailer.createTransport(url);
    const info = await transport.sendMail({ from: env().EMAIL_FROM, to: msg.to, subject: msg.subject, text: msg.text });
    return { messageId: info.messageId ?? null };
  }
}

export function emailProvider(): EmailProvider {
  return env().EMAIL_PROVIDER === "smtp" ? new SmtpEmailProvider() : new MockEmailProvider();
}

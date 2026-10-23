import "server-only";
import { prisma } from "../db";
import { env } from "../env";
import { maskPhone } from "@/lib/utils";

export interface SmsProvider {
  readonly name: string;
  readonly isMock: boolean;
  sendOtp(phone: string, code: string, purpose: string): Promise<void>;
}

/**
 * MOCK — does not send anything. Records a delivery row (without the code) so operators can see
 * that an OTP was requested. The code is surfaced to the UI only in non-production mock mode.
 */
class MockSmsProvider implements SmsProvider {
  readonly name = "mock-sms";
  readonly isMock = true;
  async sendOtp(phone: string, _code: string, purpose: string) {
    await prisma.notificationDelivery.create({
      data: { channel: "SMS", provider: this.name, templateKey: `otp.${purpose.toLowerCase()}`, toMasked: maskPhone(phone), status: "MOCK_DELIVERED", payload: {} },
    });
  }
}

export function smsProvider(): SmsProvider {
  switch (env().SMS_PROVIDER) {
    case "mock":
    default:
      return new MockSmsProvider();
  }
}

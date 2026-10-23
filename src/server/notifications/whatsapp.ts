import "server-only";
import { env } from "../env";

/**
 * WhatsApp delivery goes through an official Business Solution Provider / Cloud API only, using
 * pre-approved templates, and only to users with a recorded WhatsApp opt-in consent.
 */
export interface WhatsAppProvider {
  readonly name: string;
  readonly isMock: boolean;
  sendTemplate(input: { to: string; template: string; language: string; variables: string[] }): Promise<{ messageId: string | null }>;
}

class MockWhatsAppProvider implements WhatsAppProvider {
  readonly name = "mock-whatsapp";
  readonly isMock = true;
  async sendTemplate() {
    return { messageId: null };
  }
}

/** Meta WhatsApp Cloud API (official). Requires WHATSAPP_API_URL, WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID. */
class CloudApiWhatsAppProvider implements WhatsAppProvider {
  readonly name = "whatsapp-cloud-api";
  readonly isMock = false;
  async sendTemplate(input: { to: string; template: string; language: string; variables: string[] }) {
    const e = env();
    if (!e.WHATSAPP_API_URL || !e.WHATSAPP_ACCESS_TOKEN || !e.WHATSAPP_PHONE_NUMBER_ID) throw new Error("WhatsApp Cloud API is not configured");
    const res = await fetch(`${e.WHATSAPP_API_URL}/${e.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${e.WHATSAPP_ACCESS_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: input.to.replace(/^\+/, ""),
        type: "template",
        template: { name: input.template, language: { code: input.language }, components: [{ type: "body", parameters: input.variables.map((text) => ({ type: "text", text })) }] },
      }),
    });
    if (!res.ok) throw new Error(`WhatsApp API error ${res.status}`);
    const body = (await res.json()) as { messages?: { id: string }[] };
    return { messageId: body.messages?.[0]?.id ?? null };
  }
}

export function whatsAppProvider(): WhatsAppProvider {
  return env().WHATSAPP_PROVIDER === "cloud_api" ? new CloudApiWhatsAppProvider() : new MockWhatsAppProvider();
}

/** Mapping from internal templates to approved WhatsApp template names (configure in the BSP). */
export const WHATSAPP_TEMPLATES: Partial<Record<string, string>> = {
  "agent.approved": "hausjo_agent_approved",
  "merchant.activated": "hausjo_merchant_activated",
  "commission.payable": "hausjo_commission_payable",
  "payout.confirmed": "hausjo_payout_confirmed",
};

import "server-only";

export interface PayoutInstruction {
  attemptId: string;
  withdrawalNumber: number;
  amount: bigint;
  bankCode: string;
  bankName: string;
  accountHolderName: string;
  accountNumber: string; // decrypted only for the instruction file, never persisted or logged
}

/**
 * Disbursement adapter. Today only manual bank transfer exists: the system prepares an instruction
 * file, people execute the transfer in the bank's portal, and record + confirm it. A future
 * licensed disbursement API (bank/PJP) implements `submit` and webhook-based `confirm`.
 */
export interface DisbursementProvider {
  readonly name: string;
  readonly automated: boolean;
  /** Produce instructions (manual) or submit to the provider (automated). Must never report success itself. */
  prepare(instructions: PayoutInstruction[]): Promise<{ fileName: string; content: string } | { submitted: true }>;
}

export class ManualBankTransferProvider implements DisbursementProvider {
  readonly name = "MANUAL_BANK_TRANSFER";
  readonly automated = false;
  async prepare(instructions: PayoutInstruction[]) {
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const header = "attempt_id,withdrawal_no,bank_code,bank_name,account_holder,account_number,amount_idr,remark";
    const lines = instructions.map((i) =>
      [i.attemptId, `WD-${i.withdrawalNumber}`, i.bankCode, esc(i.bankName), esc(i.accountHolderName), `'${i.accountNumber}`, i.amount.toString(), esc(`HAUSJO WD-${i.withdrawalNumber}`)].join(","),
    );
    return { fileName: `payout-instructions-${Date.now()}.csv`, content: [header, ...lines].join("\n") };
  }
}

/** Placeholder for a licensed provider integration — intentionally not implemented. */
export class UnconfiguredApiDisbursementProvider implements DisbursementProvider {
  readonly name = "API_DISBURSEMENT";
  readonly automated = true;
  async prepare(): Promise<never> {
    throw new Error("API disbursement provider is not configured. Use MANUAL_BANK_TRANSFER.");
  }
}

export function disbursementProvider(name = "MANUAL_BANK_TRANSFER"): DisbursementProvider {
  return name === "MANUAL_BANK_TRANSFER" ? new ManualBankTransferProvider() : new UnconfiguredApiDisbursementProvider();
}

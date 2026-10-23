import "server-only";
import type { ClaimedJob } from "./queue";
import { deliverNotification } from "../notifications/deliver";
import { rematchTerminal, runReconciliation } from "../modules/transactions";
import { releaseCommissions } from "../modules/commissions";
import { processWebhookEvent } from "../modules/integrations";
import { pruneRateLimits } from "../auth/rate-limit";
import { SYSTEM_ACTOR } from "../rbac";

export async function runJob(job: ClaimedJob): Promise<void> {
  const p = job.payload as Record<string, string>;
  switch (job.type) {
    case "notification.deliver":
      return deliverNotification(p.deliveryId);
    case "transactions.rematch":
      await rematchTerminal(p.terminalId);
      return;
    case "webhook.process":
      return processWebhookEvent(p.webhookEventId, p.apiClientId, job.attempts, job.maxAttempts);
    case "commission.release":
      await releaseCommissions(SYSTEM_ACTOR);
      return;
    case "reconciliation.daily":
      await runReconciliation(SYSTEM_ACTOR, p.date);
      return;
    case "maintenance.prune":
      await pruneRateLimits();
      return;
    default:
      throw new Error(`Unknown job type ${job.type}`);
  }
}

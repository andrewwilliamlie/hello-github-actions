import { Badge } from "./badge";
import { CheckCircle2, Clock, XCircle, AlertTriangle, Circle, MinusCircle } from "lucide-react";

const GOOD = ["ACTIVE", "VERIFIED", "APPROVED", "PAYABLE", "PAID", "COMPLETED", "CONFIRMED", "SUCCESS", "MATCHED", "REWARDED", "RECONCILED", "RESOLVED", "CLEARED", "COMMITTED", "ACTIVATED", "COMMISSION_ELIGIBLE", "PROCESSED", "SENT", "MOCK_DELIVERED", "CLEAN", "IMPORTED", "VALID", "IN_STOCK", "ELIGIBLE", "PAYMENT_VERIFIED", "DEVICE_ASSIGNED"];
const BAD = ["REJECTED", "SUSPENDED", "FAILED", "REVERSED", "REFUNDED", "MISMATCH", "DEAD_LETTER", "INFECTED", "INVALID", "FAULTY", "DISPUTED", "CONFIRMED_FRAUD", "PARTIALLY_FAILED", "DISABLED"];
const WARN = ["PENDING", "SUBMITTED", "PENDING_VERIFICATION", "UNDER_REVIEW", "REVISION_REQUESTED", "AWAITING_PAYMENT", "REQUESTED", "IN_BATCH", "PROCESSING", "PENDING_APPROVAL", "AWAITING_SETTLEMENT", "UNMATCHED", "OPEN", "RECEIVED", "QUEUED", "NOT_SCANNED", "APPLICATION_SUBMITTED", "COMMITTING", "RUNNING", "DUPLICATE_IN_FILE", "DUPLICATE_EXISTING", "ACCEPTED_WITH_EXCEPTION", "ASSIGNED"];

/** Status is shown with icon + label (never colour alone). */
export function StatusBadge({ status, label }: { status: string; label?: string }) {
  const variant = GOOD.includes(status) ? "success" : BAD.includes(status) ? "danger" : WARN.includes(status) ? "warning" : "muted";
  const Icon = variant === "success" ? CheckCircle2 : variant === "danger" ? XCircle : variant === "warning" ? (status === "OPEN" || status === "UNMATCHED" ? AlertTriangle : Clock) : ["CANCELLED", "VOID", "IGNORED", "RETIRED", "ARCHIVED"].includes(status) ? MinusCircle : Circle;
  return (
    <Badge variant={variant}>
      <Icon className="size-3" aria-hidden />
      {label ?? status}
    </Badge>
  );
}

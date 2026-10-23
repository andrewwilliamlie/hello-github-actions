-- CreateEnum
CREATE TYPE "RoleKey" AS ENUM ('SUPER_ADMIN', 'FINANCE_ADMIN', 'OPERATIONS_ADMIN', 'AGENT', 'MERCHANT');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "OtpPurpose" AS ENUM ('REGISTRATION', 'WITHDRAWAL', 'PHONE_CHANGE');

-- CreateEnum
CREATE TYPE "ConsentType" AS ENUM ('TERMS', 'PRIVACY', 'DATA_PROCESSING', 'WHATSAPP', 'MARKETING');

-- CreateEnum
CREATE TYPE "FilePurpose" AS ENUM ('KYC_ID_CARD', 'KYC_SELFIE', 'MERCHANT_DOCUMENT', 'PAYMENT_PROOF', 'PAYOUT_PROOF', 'IMPORT_SOURCE', 'IMPORT_ERROR_REPORT', 'PRODUCT_IMAGE');

-- CreateEnum
CREATE TYPE "FileClassification" AS ENUM ('PUBLIC', 'INTERNAL', 'RESTRICTED');

-- CreateEnum
CREATE TYPE "ScanStatus" AS ENUM ('PENDING', 'CLEAN', 'INFECTED', 'NOT_SCANNED');

-- CreateEnum
CREATE TYPE "AgentStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED', 'REJECTED');

-- CreateEnum
CREATE TYPE "KycStatus" AS ENUM ('NOT_SUBMITTED', 'SUBMITTED', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "BankAccountStatus" AS ENUM ('PENDING_VERIFICATION', 'VERIFIED', 'REJECTED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ReferralStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'VOID');

-- CreateEnum
CREATE TYPE "ProductCategory" AS ENUM ('EDC_ANDROID', 'EDC_MOBILE', 'SOUNDBOX');

-- CreateEnum
CREATE TYPE "CommissionType" AS ENUM ('SALES', 'TRANSACTION_REWARD', 'REFERRAL_SALES', 'REFERRAL_TRANSACTION', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "RuleStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'ACTIVE', 'RETIRED', 'REJECTED');

-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('LEAD', 'CONTACTED', 'APPLICATION_SUBMITTED', 'UNDER_REVIEW', 'REVISION_REQUESTED', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MerchantStatus" AS ENUM ('APPROVED', 'PAYMENT_VERIFIED', 'DEVICE_ASSIGNED', 'ACTIVATED', 'COMMISSION_ELIGIBLE', 'SUSPENDED', 'REFUNDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MerchantDocumentType" AS ENUM ('OWNER_ID_CARD', 'NPWP', 'NIB', 'STORE_PHOTO', 'BANK_BOOK', 'OTHER');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('UPLOADED', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('AWAITING_PAYMENT', 'PAYMENT_VERIFIED', 'DEVICE_ASSIGNED', 'ACTIVATED', 'CANCELLED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('SUBMITTED', 'VERIFIED', 'REJECTED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('BANK_TRANSFER', 'VIRTUAL_ACCOUNT', 'QRIS', 'CASH');

-- CreateEnum
CREATE TYPE "DeviceStatus" AS ENUM ('IN_STOCK', 'ASSIGNED', 'ACTIVE', 'RETURNED', 'FAULTY', 'RETIRED');

-- CreateEnum
CREATE TYPE "InventoryMovementType" AS ENUM ('RECEIVED', 'ASSIGNED', 'ACTIVATED', 'RETURNED', 'MARKED_FAULTY', 'RETIRED');

-- CreateEnum
CREATE TYPE "TxnStatus" AS ENUM ('SUCCESS', 'FAILED', 'PENDING', 'REVERSED');

-- CreateEnum
CREATE TYPE "TxnMatchStatus" AS ENUM ('MATCHED', 'UNMATCHED');

-- CreateEnum
CREATE TYPE "TxnRewardStatus" AS ENUM ('NOT_EVALUATED', 'AWAITING_SETTLEMENT', 'REWARDED', 'INELIGIBLE', 'REVERSED');

-- CreateEnum
CREATE TYPE "SettlementStatus" AS ENUM ('RECEIVED', 'RECONCILED', 'MISMATCH', 'ACCEPTED_WITH_EXCEPTION');

-- CreateEnum
CREATE TYPE "ImportType" AS ENUM ('TRANSACTIONS', 'SETTLEMENTS', 'MERCHANT_LEADS', 'DEVICES');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('VALIDATED', 'COMMITTING', 'COMMITTED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ImportRowStatus" AS ENUM ('VALID', 'INVALID', 'DUPLICATE_IN_FILE', 'DUPLICATE_EXISTING', 'IMPORTED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "ReconRunStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "ExceptionType" AS ENUM ('UNMATCHED_TERMINAL', 'SETTLEMENT_MISMATCH', 'MISSING_SETTLEMENT', 'STATUS_CONFLICT', 'NO_ATTRIBUTION', 'DEVICE_NOT_ACTIVE');

-- CreateEnum
CREATE TYPE "ExceptionStatus" AS ENUM ('OPEN', 'RESOLVED', 'IGNORED');

-- CreateEnum
CREATE TYPE "CommissionStatus" AS ENUM ('PENDING', 'ELIGIBLE', 'APPROVED', 'PAYABLE', 'PAID', 'REVERSED', 'DISPUTED');

-- CreateEnum
CREATE TYPE "LedgerAccount" AS ENUM ('AGENT_PENDING', 'AGENT_PAYABLE', 'AGENT_RESERVED', 'AGENT_RECEIVABLE', 'COMMISSION_EXPENSE', 'PAYOUT_CLEARING');

-- CreateEnum
CREATE TYPE "LedgerDirection" AS ENUM ('DEBIT', 'CREDIT');

-- CreateEnum
CREATE TYPE "JournalKind" AS ENUM ('ACCRUAL', 'RELEASE', 'REVERSAL', 'WITHDRAWAL_RESERVE', 'WITHDRAWAL_RELEASE', 'PAYOUT', 'CLAWBACK', 'CLAWBACK_RECOVERY', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "WithdrawalStatus" AS ENUM ('REQUESTED', 'APPROVED', 'REJECTED', 'CANCELLED', 'IN_BATCH', 'PROCESSING', 'PAID', 'FAILED');

-- CreateEnum
CREATE TYPE "PayoutBatchStatus" AS ENUM ('PENDING_APPROVAL', 'APPROVED', 'PROCESSING', 'COMPLETED', 'PARTIALLY_FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PayoutAttemptStatus" AS ENUM ('PENDING', 'SUBMITTED', 'CONFIRMED', 'FAILED');

-- CreateEnum
CREATE TYPE "FraudFlagStatus" AS ENUM ('OPEN', 'CLEARED', 'CONFIRMED');

-- CreateEnum
CREATE TYPE "Severity" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "DisputeStatus" AS ENUM ('OPEN', 'RESOLVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "DeliveryChannel" AS ENUM ('EMAIL', 'WHATSAPP', 'SMS');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('QUEUED', 'SENT', 'MOCK_DELIVERED', 'FAILED', 'SKIPPED_NO_CONSENT');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'DEAD');

-- CreateEnum
CREATE TYPE "WebhookStatus" AS ENUM ('RECEIVED', 'PROCESSED', 'FAILED', 'DEAD_LETTER');

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "key" "RoleKey" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "locale" TEXT NOT NULL DEFAULT 'id',
    "emailVerifiedAt" TIMESTAMP(3),
    "phoneVerifiedAt" TIMESTAMP(3),
    "mfaSecretEnc" TEXT,
    "mfaEnabledAt" TIMESTAMP(3),
    "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserRole" (
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "grantedBy" TEXT,

    CONSTRAINT "UserRole_pkey" PRIMARY KEY ("userId","roleId")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mfaVerified" BOOLEAN NOT NULL DEFAULT false,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OtpChallenge" (
    "id" TEXT NOT NULL,
    "purpose" "OtpPurpose" NOT NULL,
    "destination" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OtpChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateLimitBucket" (
    "key" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "RateLimitBucket_pkey" PRIMARY KEY ("key","windowStart")
);

-- CreateTable
CREATE TABLE "Consent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "ConsentType" NOT NULL,
    "version" TEXT NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "withdrawnAt" TIMESTAMP(3),
    "ip" TEXT,

    CONSTRAINT "Consent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiClient" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "partnerSource" TEXT NOT NULL,
    "keyPrefix" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "webhookSecretEnc" TEXT,
    "scopes" TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),

    CONSTRAINT "ApiClient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoredFile" (
    "id" TEXT NOT NULL,
    "purpose" "FilePurpose" NOT NULL,
    "classification" "FileClassification" NOT NULL,
    "storageKey" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "scanStatus" "ScanStatus" NOT NULL DEFAULT 'PENDING',
    "uploadedById" TEXT,
    "ownerAgentId" TEXT,
    "retentionUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "StoredFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Agent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "agentNumber" SERIAL NOT NULL,
    "agentCode" TEXT NOT NULL,
    "referralCode" TEXT NOT NULL,
    "status" "AgentStatus" NOT NULL DEFAULT 'PENDING',
    "fullName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "addressLine" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "province" TEXT NOT NULL,
    "postalCode" TEXT,
    "approvedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "statusReason" TEXT,
    "whatsappOptIn" BOOLEAN NOT NULL DEFAULT false,
    "whatsappOptInAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Agent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentKYC" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "idType" TEXT NOT NULL DEFAULT 'KTP',
    "idNumberEnc" TEXT,
    "idNumberHash" TEXT,
    "idNumberLast4" TEXT,
    "idCardFileId" TEXT,
    "selfieFileId" TEXT,
    "status" "KycStatus" NOT NULL DEFAULT 'NOT_SUBMITTED',
    "submittedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "rejectionReason" TEXT,
    "retentionUntil" TIMESTAMP(3),

    CONSTRAINT "AgentKYC_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentAgreement" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "agreementVersion" TEXT NOT NULL,
    "agreementHash" TEXT NOT NULL,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "AgentAgreement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentBankAccount" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "bankCode" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "accountHolderName" TEXT NOT NULL,
    "accountNumberEnc" TEXT NOT NULL,
    "accountNumberHash" TEXT NOT NULL,
    "accountNumberLast4" TEXT NOT NULL,
    "status" "BankAccountStatus" NOT NULL DEFAULT 'PENDING_VERIFICATION',
    "verifiedAt" TIMESTAMP(3),
    "verifiedById" TEXT,
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentBankAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentReferral" (
    "id" TEXT NOT NULL,
    "referrerAgentId" TEXT NOT NULL,
    "recruitAgentId" TEXT NOT NULL,
    "referralCodeUsed" TEXT NOT NULL,
    "status" "ReferralStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "endedReason" TEXT,
    "createdById" TEXT,

    CONSTRAINT "AgentReferral_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "category" "ProductCategory" NOT NULL,
    "description" TEXT NOT NULL,
    "specs" JSONB NOT NULL,
    "imageUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductPrice" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "priceIdr" BIGINT NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductPrice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommissionRule" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "type" "CommissionType" NOT NULL,
    "status" "RuleStatus" NOT NULL DEFAULT 'DRAFT',
    "name" TEXT NOT NULL,
    "description" TEXT,
    "productId" TEXT,
    "fixedAmount" BIGINT,
    "rateBps" INTEGER,
    "capAmount" BIGINT,
    "conditions" JSONB NOT NULL DEFAULT '{}',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "holdDays" INTEGER NOT NULL DEFAULT 0,
    "requiresManualApproval" BOOLEAN NOT NULL DEFAULT false,
    "deductFromRecruit" BOOLEAN NOT NULL DEFAULT false,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommissionRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MerchantLead" (
    "id" TEXT NOT NULL,
    "leadNumber" SERIAL NOT NULL,
    "agentId" TEXT NOT NULL,
    "businessName" TEXT NOT NULL,
    "ownerName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "businessType" TEXT NOT NULL,
    "addressLine" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "province" TEXT NOT NULL,
    "postalCode" TEXT,
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "productId" TEXT NOT NULL,
    "notes" TEXT,
    "status" "LeadStatus" NOT NULL DEFAULT 'LEAD',
    "revisionNote" TEXT,
    "rejectionReason" TEXT,
    "dedupeKey" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "merchantId" TEXT,
    "importRowId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "MerchantLead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Merchant" (
    "id" TEXT NOT NULL,
    "merchantNumber" SERIAL NOT NULL,
    "merchantCode" TEXT NOT NULL,
    "businessName" TEXT NOT NULL,
    "ownerName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "businessType" TEXT NOT NULL,
    "addressLine" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "province" TEXT NOT NULL,
    "postalCode" TEXT,
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "status" "MerchantStatus" NOT NULL DEFAULT 'APPROVED',
    "statusReason" TEXT,
    "dedupeKey" TEXT NOT NULL,
    "processorMid" TEXT,
    "userId" TEXT,
    "approvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Merchant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MerchantAttribution" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "reason" TEXT NOT NULL,
    "createdById" TEXT,
    "approvedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MerchantAttribution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MerchantDocument" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "merchantId" TEXT,
    "type" "MerchantDocumentType" NOT NULL,
    "fileId" TEXT NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'UPLOADED',
    "verifiedById" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MerchantDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesOrder" (
    "id" TEXT NOT NULL,
    "orderNumber" SERIAL NOT NULL,
    "merchantId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "sellingAgentId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" BIGINT NOT NULL,
    "totalAmount" BIGINT NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'AWAITING_PAYMENT',
    "statusReason" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "reference" TEXT NOT NULL,
    "payerName" TEXT,
    "proofFileId" TEXT,
    "status" "PaymentStatus" NOT NULL DEFAULT 'SUBMITTED',
    "verifiedById" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "refundedAt" TIMESTAMP(3),
    "refundReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Device" (
    "id" TEXT NOT NULL,
    "serialNumber" TEXT NOT NULL,
    "terminalId" TEXT,
    "productId" TEXT NOT NULL,
    "status" "DeviceStatus" NOT NULL DEFAULT 'IN_STOCK',
    "merchantId" TEXT,
    "orderId" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Device_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryMovement" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "type" "InventoryMovementType" NOT NULL,
    "fromStatus" "DeviceStatus",
    "toStatus" "DeviceStatus" NOT NULL,
    "orderId" TEXT,
    "merchantId" TEXT,
    "note" TEXT,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Activation" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "terminalId" TEXT NOT NULL,
    "activatedAt" TIMESTAMP(3) NOT NULL,
    "activatedById" TEXT,
    "deactivatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Activation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "merchantId" TEXT,
    "deviceId" TEXT,
    "terminalId" TEXT NOT NULL,
    "processorMid" TEXT,
    "type" TEXT NOT NULL,
    "status" "TxnStatus" NOT NULL,
    "amount" BIGINT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'IDR',
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "businessDate" DATE NOT NULL,
    "settlementRef" TEXT,
    "settlementId" TEXT,
    "settledAt" TIMESTAMP(3),
    "isTest" BOOLEAN NOT NULL DEFAULT false,
    "matchStatus" "TxnMatchStatus" NOT NULL DEFAULT 'UNMATCHED',
    "rewardStatus" "TxnRewardStatus" NOT NULL DEFAULT 'NOT_EVALUATED',
    "ineligibleReason" TEXT,
    "importId" TEXT,
    "ingestChannel" TEXT NOT NULL,
    "rawPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Settlement" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "settlementRef" TEXT NOT NULL,
    "settlementDate" DATE NOT NULL,
    "expectedCount" INTEGER NOT NULL,
    "expectedAmount" BIGINT NOT NULL,
    "matchedCount" INTEGER NOT NULL DEFAULT 0,
    "matchedAmount" BIGINT NOT NULL DEFAULT 0,
    "status" "SettlementStatus" NOT NULL DEFAULT 'RECEIVED',
    "reconciledAt" TIMESTAMP(3),
    "importId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Settlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransactionImport" (
    "id" TEXT NOT NULL,
    "type" "ImportType" NOT NULL,
    "source" TEXT,
    "fileId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "status" "ImportStatus" NOT NULL DEFAULT 'VALIDATED',
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "validRows" INTEGER NOT NULL DEFAULT 0,
    "invalidRows" INTEGER NOT NULL DEFAULT 0,
    "duplicateRows" INTEGER NOT NULL DEFAULT 0,
    "importedRows" INTEGER NOT NULL DEFAULT 0,
    "previousImportId" TEXT,
    "errorReportFileId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "committedAt" TIMESTAMP(3),

    CONSTRAINT "TransactionImport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportRow" (
    "id" TEXT NOT NULL,
    "importId" TEXT NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "raw" JSONB NOT NULL,
    "normalized" JSONB,
    "status" "ImportRowStatus" NOT NULL,
    "errors" JSONB NOT NULL DEFAULT '[]',
    "entityId" TEXT,

    CONSTRAINT "ImportRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReconciliationRun" (
    "id" TEXT NOT NULL,
    "businessDate" DATE NOT NULL,
    "status" "ReconRunStatus" NOT NULL DEFAULT 'RUNNING',
    "stats" JSONB NOT NULL DEFAULT '{}',
    "triggeredBy" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "error" TEXT,

    CONSTRAINT "ReconciliationRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReconciliationException" (
    "id" TEXT NOT NULL,
    "type" "ExceptionType" NOT NULL,
    "status" "ExceptionStatus" NOT NULL DEFAULT 'OPEN',
    "transactionId" TEXT,
    "settlementId" TEXT,
    "runId" TEXT,
    "details" JSONB NOT NULL DEFAULT '{}',
    "resolution" TEXT,
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReconciliationException_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommissionEvent" (
    "id" TEXT NOT NULL,
    "eventRef" TEXT NOT NULL,
    "type" "CommissionType" NOT NULL,
    "status" "CommissionStatus" NOT NULL DEFAULT 'PENDING',
    "agentId" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "deductedAmount" BIGINT NOT NULL DEFAULT 0,
    "ruleId" TEXT,
    "ruleCode" TEXT,
    "ruleVersion" INTEGER,
    "ruleSnapshot" JSONB NOT NULL,
    "calculation" JSONB NOT NULL,
    "sourceOrderId" TEXT,
    "sourceTransactionId" TEXT,
    "sourceEventId" TEXT,
    "merchantId" TEXT,
    "productId" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "businessDate" DATE NOT NULL,
    "holdUntil" TIMESTAMP(3) NOT NULL,
    "eligibleAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "payableAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "reversedAt" TIMESTAMP(3),
    "reversalReason" TEXT,
    "disputedAt" TIMESTAMP(3),
    "disputeReason" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommissionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerJournal" (
    "id" TEXT NOT NULL,
    "journalRef" TEXT NOT NULL,
    "kind" "JournalKind" NOT NULL,
    "description" TEXT NOT NULL,
    "agentId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LedgerJournal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommissionLedgerEntry" (
    "id" TEXT NOT NULL,
    "journalId" TEXT NOT NULL,
    "account" "LedgerAccount" NOT NULL,
    "agentId" TEXT,
    "direction" "LedgerDirection" NOT NULL,
    "amount" BIGINT NOT NULL,
    "commissionEventId" TEXT,
    "withdrawalId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommissionLedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReferralCommission" (
    "id" TEXT NOT NULL,
    "referralId" TEXT NOT NULL,
    "referrerAgentId" TEXT NOT NULL,
    "recruitAgentId" TEXT NOT NULL,
    "baseEventId" TEXT NOT NULL,
    "referralEventId" TEXT NOT NULL,
    "baseAmount" BIGINT NOT NULL,
    "rateBps" INTEGER NOT NULL,
    "amount" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReferralCommission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Wallet" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "pendingBalance" BIGINT NOT NULL DEFAULT 0,
    "payableBalance" BIGINT NOT NULL DEFAULT 0,
    "reservedBalance" BIGINT NOT NULL DEFAULT 0,
    "receivableBalance" BIGINT NOT NULL DEFAULT 0,
    "paidTotal" BIGINT NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Wallet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WithdrawalRequest" (
    "id" TEXT NOT NULL,
    "withdrawalNumber" SERIAL NOT NULL,
    "agentId" TEXT NOT NULL,
    "bankAccountId" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "status" "WithdrawalStatus" NOT NULL DEFAULT 'REQUESTED',
    "idempotencyKey" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "batchId" TEXT,
    "paidAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WithdrawalRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayoutBatch" (
    "id" TEXT NOT NULL,
    "batchNumber" SERIAL NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'MANUAL_BANK_TRANSFER',
    "status" "PayoutBatchStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "totalAmount" BIGINT NOT NULL,
    "itemCount" INTEGER NOT NULL,
    "createdById" TEXT NOT NULL,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayoutBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayoutAttempt" (
    "id" TEXT NOT NULL,
    "withdrawalId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "provider" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "status" "PayoutAttemptStatus" NOT NULL DEFAULT 'PENDING',
    "providerReference" TEXT,
    "proofFileId" TEXT,
    "recordedById" TEXT,
    "recordedAt" TIMESTAMP(3),
    "confirmedById" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayoutAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FraudFlag" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "severity" "Severity" NOT NULL,
    "status" "FraudFlagStatus" NOT NULL DEFAULT 'OPEN',
    "agentId" TEXT,
    "merchantId" TEXT,
    "transactionId" TEXT,
    "details" JSONB NOT NULL DEFAULT '{}',
    "dedupeKey" TEXT NOT NULL,
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolution" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FraudFlag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Dispute" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" "DisputeStatus" NOT NULL DEFAULT 'OPEN',
    "commissionEventId" TEXT,
    "merchantId" TEXT,
    "agentId" TEXT,
    "raisedById" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "resolution" TEXT,
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Dispute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "link" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationDelivery" (
    "id" TEXT NOT NULL,
    "notificationId" TEXT,
    "userId" TEXT,
    "channel" "DeliveryChannel" NOT NULL,
    "provider" TEXT NOT NULL,
    "templateKey" TEXT NOT NULL,
    "toMasked" TEXT NOT NULL,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'QUEUED',
    "providerMessageId" TEXT,
    "error" TEXT,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "NotificationDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorUserId" TEXT,
    "actorRole" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "before" JSONB,
    "after" JSONB,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemSetting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "description" TEXT NOT NULL,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemSetting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "dedupeKey" TEXT,
    "runAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "lastError" TEXT,
    "lockedAt" TIMESTAMP(3),
    "lockedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookEvent" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalEventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "signatureValid" BOOLEAN NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "WebhookStatus" NOT NULL DEFAULT 'RECEIVED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Role_key_key" ON "Role"("key");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "OtpChallenge_destination_purpose_createdAt_idx" ON "OtpChallenge"("destination", "purpose", "createdAt");

-- CreateIndex
CREATE INDEX "Consent_userId_type_idx" ON "Consent"("userId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "ApiClient_keyPrefix_key" ON "ApiClient"("keyPrefix");

-- CreateIndex
CREATE UNIQUE INDEX "ApiClient_keyHash_key" ON "ApiClient"("keyHash");

-- CreateIndex
CREATE UNIQUE INDEX "StoredFile_storageKey_key" ON "StoredFile"("storageKey");

-- CreateIndex
CREATE INDEX "StoredFile_ownerAgentId_idx" ON "StoredFile"("ownerAgentId");

-- CreateIndex
CREATE UNIQUE INDEX "Agent_userId_key" ON "Agent"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Agent_agentNumber_key" ON "Agent"("agentNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Agent_agentCode_key" ON "Agent"("agentCode");

-- CreateIndex
CREATE UNIQUE INDEX "Agent_referralCode_key" ON "Agent"("referralCode");

-- CreateIndex
CREATE INDEX "Agent_status_idx" ON "Agent"("status");

-- CreateIndex
CREATE INDEX "Agent_province_city_idx" ON "Agent"("province", "city");

-- CreateIndex
CREATE UNIQUE INDEX "AgentKYC_agentId_key" ON "AgentKYC"("agentId");

-- CreateIndex
CREATE UNIQUE INDEX "AgentKYC_idNumberHash_key" ON "AgentKYC"("idNumberHash");

-- CreateIndex
CREATE UNIQUE INDEX "AgentAgreement_agentId_agreementVersion_key" ON "AgentAgreement"("agentId", "agreementVersion");

-- CreateIndex
CREATE INDEX "AgentBankAccount_agentId_idx" ON "AgentBankAccount"("agentId");

-- CreateIndex
CREATE INDEX "AgentBankAccount_accountNumberHash_idx" ON "AgentBankAccount"("accountNumberHash");

-- CreateIndex
CREATE INDEX "AgentReferral_referrerAgentId_status_idx" ON "AgentReferral"("referrerAgentId", "status");

-- CreateIndex
CREATE INDEX "AgentReferral_recruitAgentId_idx" ON "AgentReferral"("recruitAgentId");

-- CreateIndex
CREATE UNIQUE INDEX "Product_sku_key" ON "Product"("sku");

-- CreateIndex
CREATE UNIQUE INDEX "Product_slug_key" ON "Product"("slug");

-- CreateIndex
CREATE INDEX "ProductPrice_productId_effectiveFrom_idx" ON "ProductPrice"("productId", "effectiveFrom");

-- CreateIndex
CREATE INDEX "CommissionRule_type_status_effectiveFrom_idx" ON "CommissionRule"("type", "status", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "CommissionRule_code_version_key" ON "CommissionRule"("code", "version");

-- CreateIndex
CREATE UNIQUE INDEX "MerchantLead_leadNumber_key" ON "MerchantLead"("leadNumber");

-- CreateIndex
CREATE UNIQUE INDEX "MerchantLead_merchantId_key" ON "MerchantLead"("merchantId");

-- CreateIndex
CREATE INDEX "MerchantLead_agentId_status_idx" ON "MerchantLead"("agentId", "status");

-- CreateIndex
CREATE INDEX "MerchantLead_status_idx" ON "MerchantLead"("status");

-- CreateIndex
CREATE INDEX "MerchantLead_dedupeKey_idx" ON "MerchantLead"("dedupeKey");

-- CreateIndex
CREATE UNIQUE INDEX "Merchant_merchantNumber_key" ON "Merchant"("merchantNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Merchant_merchantCode_key" ON "Merchant"("merchantCode");

-- CreateIndex
CREATE UNIQUE INDEX "Merchant_dedupeKey_key" ON "Merchant"("dedupeKey");

-- CreateIndex
CREATE UNIQUE INDEX "Merchant_processorMid_key" ON "Merchant"("processorMid");

-- CreateIndex
CREATE UNIQUE INDEX "Merchant_userId_key" ON "Merchant"("userId");

-- CreateIndex
CREATE INDEX "Merchant_status_idx" ON "Merchant"("status");

-- CreateIndex
CREATE INDEX "Merchant_province_city_idx" ON "Merchant"("province", "city");

-- CreateIndex
CREATE INDEX "MerchantAttribution_merchantId_effectiveFrom_idx" ON "MerchantAttribution"("merchantId", "effectiveFrom");

-- CreateIndex
CREATE INDEX "MerchantAttribution_agentId_idx" ON "MerchantAttribution"("agentId");

-- CreateIndex
CREATE INDEX "MerchantDocument_leadId_idx" ON "MerchantDocument"("leadId");

-- CreateIndex
CREATE UNIQUE INDEX "SalesOrder_orderNumber_key" ON "SalesOrder"("orderNumber");

-- CreateIndex
CREATE INDEX "SalesOrder_sellingAgentId_status_idx" ON "SalesOrder"("sellingAgentId", "status");

-- CreateIndex
CREATE INDEX "SalesOrder_merchantId_idx" ON "SalesOrder"("merchantId");

-- CreateIndex
CREATE INDEX "Payment_orderId_idx" ON "Payment"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_method_reference_key" ON "Payment"("method", "reference");

-- CreateIndex
CREATE UNIQUE INDEX "Device_serialNumber_key" ON "Device"("serialNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Device_terminalId_key" ON "Device"("terminalId");

-- CreateIndex
CREATE UNIQUE INDEX "Device_orderId_key" ON "Device"("orderId");

-- CreateIndex
CREATE INDEX "Device_productId_status_idx" ON "Device"("productId", "status");

-- CreateIndex
CREATE INDEX "InventoryMovement_deviceId_idx" ON "InventoryMovement"("deviceId");

-- CreateIndex
CREATE UNIQUE INDEX "Activation_orderId_key" ON "Activation"("orderId");

-- CreateIndex
CREATE INDEX "Activation_deviceId_idx" ON "Activation"("deviceId");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_idempotencyKey_key" ON "Transaction"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Transaction_merchantId_businessDate_idx" ON "Transaction"("merchantId", "businessDate");

-- CreateIndex
CREATE INDEX "Transaction_terminalId_idx" ON "Transaction"("terminalId");

-- CreateIndex
CREATE INDEX "Transaction_settlementRef_idx" ON "Transaction"("settlementRef");

-- CreateIndex
CREATE INDEX "Transaction_rewardStatus_idx" ON "Transaction"("rewardStatus");

-- CreateIndex
CREATE INDEX "Transaction_businessDate_idx" ON "Transaction"("businessDate");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_source_externalId_key" ON "Transaction"("source", "externalId");

-- CreateIndex
CREATE INDEX "Settlement_settlementDate_idx" ON "Settlement"("settlementDate");

-- CreateIndex
CREATE UNIQUE INDEX "Settlement_source_settlementRef_key" ON "Settlement"("source", "settlementRef");

-- CreateIndex
CREATE INDEX "TransactionImport_sha256_type_idx" ON "TransactionImport"("sha256", "type");

-- CreateIndex
CREATE INDEX "ImportRow_importId_status_idx" ON "ImportRow"("importId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ImportRow_importId_rowNumber_key" ON "ImportRow"("importId", "rowNumber");

-- CreateIndex
CREATE INDEX "ReconciliationRun_businessDate_idx" ON "ReconciliationRun"("businessDate");

-- CreateIndex
CREATE INDEX "ReconciliationException_status_type_idx" ON "ReconciliationException"("status", "type");

-- CreateIndex
CREATE UNIQUE INDEX "ReconciliationException_type_transactionId_key" ON "ReconciliationException"("type", "transactionId");

-- CreateIndex
CREATE UNIQUE INDEX "ReconciliationException_type_settlementId_key" ON "ReconciliationException"("type", "settlementId");

-- CreateIndex
CREATE UNIQUE INDEX "CommissionEvent_eventRef_key" ON "CommissionEvent"("eventRef");

-- CreateIndex
CREATE INDEX "CommissionEvent_agentId_status_idx" ON "CommissionEvent"("agentId", "status");

-- CreateIndex
CREATE INDEX "CommissionEvent_agentId_businessDate_idx" ON "CommissionEvent"("agentId", "businessDate");

-- CreateIndex
CREATE INDEX "CommissionEvent_status_holdUntil_idx" ON "CommissionEvent"("status", "holdUntil");

-- CreateIndex
CREATE UNIQUE INDEX "CommissionEvent_type_sourceOrderId_key" ON "CommissionEvent"("type", "sourceOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "CommissionEvent_type_sourceTransactionId_key" ON "CommissionEvent"("type", "sourceTransactionId");

-- CreateIndex
CREATE UNIQUE INDEX "CommissionEvent_type_sourceEventId_key" ON "CommissionEvent"("type", "sourceEventId");

-- CreateIndex
CREATE UNIQUE INDEX "LedgerJournal_journalRef_key" ON "LedgerJournal"("journalRef");

-- CreateIndex
CREATE INDEX "LedgerJournal_agentId_createdAt_idx" ON "LedgerJournal"("agentId", "createdAt");

-- CreateIndex
CREATE INDEX "CommissionLedgerEntry_agentId_account_idx" ON "CommissionLedgerEntry"("agentId", "account");

-- CreateIndex
CREATE INDEX "CommissionLedgerEntry_commissionEventId_idx" ON "CommissionLedgerEntry"("commissionEventId");

-- CreateIndex
CREATE INDEX "CommissionLedgerEntry_journalId_idx" ON "CommissionLedgerEntry"("journalId");

-- CreateIndex
CREATE UNIQUE INDEX "ReferralCommission_baseEventId_key" ON "ReferralCommission"("baseEventId");

-- CreateIndex
CREATE UNIQUE INDEX "ReferralCommission_referralEventId_key" ON "ReferralCommission"("referralEventId");

-- CreateIndex
CREATE INDEX "ReferralCommission_referrerAgentId_idx" ON "ReferralCommission"("referrerAgentId");

-- CreateIndex
CREATE UNIQUE INDEX "Wallet_agentId_key" ON "Wallet"("agentId");

-- CreateIndex
CREATE UNIQUE INDEX "WithdrawalRequest_withdrawalNumber_key" ON "WithdrawalRequest"("withdrawalNumber");

-- CreateIndex
CREATE UNIQUE INDEX "WithdrawalRequest_idempotencyKey_key" ON "WithdrawalRequest"("idempotencyKey");

-- CreateIndex
CREATE INDEX "WithdrawalRequest_agentId_status_idx" ON "WithdrawalRequest"("agentId", "status");

-- CreateIndex
CREATE INDEX "WithdrawalRequest_status_idx" ON "WithdrawalRequest"("status");

-- CreateIndex
CREATE UNIQUE INDEX "PayoutBatch_batchNumber_key" ON "PayoutBatch"("batchNumber");

-- CreateIndex
CREATE INDEX "PayoutAttempt_batchId_idx" ON "PayoutAttempt"("batchId");

-- CreateIndex
CREATE UNIQUE INDEX "PayoutAttempt_withdrawalId_attemptNumber_key" ON "PayoutAttempt"("withdrawalId", "attemptNumber");

-- CreateIndex
CREATE UNIQUE INDEX "FraudFlag_dedupeKey_key" ON "FraudFlag"("dedupeKey");

-- CreateIndex
CREATE INDEX "FraudFlag_status_idx" ON "FraudFlag"("status");

-- CreateIndex
CREATE INDEX "FraudFlag_agentId_status_idx" ON "FraudFlag"("agentId", "status");

-- CreateIndex
CREATE INDEX "Dispute_status_idx" ON "Dispute"("status");

-- CreateIndex
CREATE INDEX "Dispute_agentId_idx" ON "Dispute"("agentId");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");

-- CreateIndex
CREATE INDEX "NotificationDelivery_status_idx" ON "NotificationDelivery"("status");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_actorUserId_idx" ON "AuditLog"("actorUserId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Job_dedupeKey_key" ON "Job"("dedupeKey");

-- CreateIndex
CREATE INDEX "Job_status_runAt_idx" ON "Job"("status", "runAt");

-- CreateIndex
CREATE INDEX "WebhookEvent_status_idx" ON "WebhookEvent"("status");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookEvent_provider_externalEventId_key" ON "WebhookEvent"("provider", "externalEventId");

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consent" ADD CONSTRAINT "Consent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Agent" ADD CONSTRAINT "Agent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentKYC" ADD CONSTRAINT "AgentKYC_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentAgreement" ADD CONSTRAINT "AgentAgreement_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentBankAccount" ADD CONSTRAINT "AgentBankAccount_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentReferral" ADD CONSTRAINT "AgentReferral_referrerAgentId_fkey" FOREIGN KEY ("referrerAgentId") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentReferral" ADD CONSTRAINT "AgentReferral_recruitAgentId_fkey" FOREIGN KEY ("recruitAgentId") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductPrice" ADD CONSTRAINT "ProductPrice_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionRule" ADD CONSTRAINT "CommissionRule_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchantLead" ADD CONSTRAINT "MerchantLead_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchantLead" ADD CONSTRAINT "MerchantLead_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchantLead" ADD CONSTRAINT "MerchantLead_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Merchant" ADD CONSTRAINT "Merchant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchantAttribution" ADD CONSTRAINT "MerchantAttribution_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchantAttribution" ADD CONSTRAINT "MerchantAttribution_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchantDocument" ADD CONSTRAINT "MerchantDocument_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "MerchantLead"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchantDocument" ADD CONSTRAINT "MerchantDocument_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrder" ADD CONSTRAINT "SalesOrder_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrder" ADD CONSTRAINT "SalesOrder_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrder" ADD CONSTRAINT "SalesOrder_sellingAgentId_fkey" FOREIGN KEY ("sellingAgentId") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "SalesOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Device" ADD CONSTRAINT "Device_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Device" ADD CONSTRAINT "Device_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Device" ADD CONSTRAINT "Device_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "SalesOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activation" ADD CONSTRAINT "Activation_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "SalesOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activation" ADD CONSTRAINT "Activation_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "Settlement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportRow" ADD CONSTRAINT "ImportRow_importId_fkey" FOREIGN KEY ("importId") REFERENCES "TransactionImport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionEvent" ADD CONSTRAINT "CommissionEvent_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionEvent" ADD CONSTRAINT "CommissionEvent_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "CommissionRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionLedgerEntry" ADD CONSTRAINT "CommissionLedgerEntry_journalId_fkey" FOREIGN KEY ("journalId") REFERENCES "LedgerJournal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionLedgerEntry" ADD CONSTRAINT "CommissionLedgerEntry_commissionEventId_fkey" FOREIGN KEY ("commissionEventId") REFERENCES "CommissionEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralCommission" ADD CONSTRAINT "ReferralCommission_referralId_fkey" FOREIGN KEY ("referralId") REFERENCES "AgentReferral"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralCommission" ADD CONSTRAINT "ReferralCommission_baseEventId_fkey" FOREIGN KEY ("baseEventId") REFERENCES "CommissionEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralCommission" ADD CONSTRAINT "ReferralCommission_referralEventId_fkey" FOREIGN KEY ("referralEventId") REFERENCES "CommissionEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WithdrawalRequest" ADD CONSTRAINT "WithdrawalRequest_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WithdrawalRequest" ADD CONSTRAINT "WithdrawalRequest_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "AgentBankAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WithdrawalRequest" ADD CONSTRAINT "WithdrawalRequest_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "PayoutBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayoutAttempt" ADD CONSTRAINT "PayoutAttempt_withdrawalId_fkey" FOREIGN KEY ("withdrawalId") REFERENCES "WithdrawalRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayoutAttempt" ADD CONSTRAINT "PayoutAttempt_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "PayoutBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ═══════════════════════ Integrity guarantees beyond Prisma's DSL ═══════════════════════

-- Money must be positive / non-negative
ALTER TABLE "CommissionEvent" ADD CONSTRAINT "commission_event_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "CommissionEvent" ADD CONSTRAINT "commission_event_deduction_range" CHECK ("deductedAmount" >= 0 AND "deductedAmount" <= "amount");
ALTER TABLE "CommissionLedgerEntry" ADD CONSTRAINT "ledger_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "WithdrawalRequest" ADD CONSTRAINT "withdrawal_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "PayoutAttempt" ADD CONSTRAINT "payout_attempt_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "ProductPrice" ADD CONSTRAINT "product_price_non_negative" CHECK ("priceIdr" >= 0);
ALTER TABLE "Wallet" ADD CONSTRAINT "wallet_balances_non_negative" CHECK (
  "pendingBalance" >= 0 AND "payableBalance" >= 0 AND "reservedBalance" >= 0
  AND "receivableBalance" >= 0 AND "paidTotal" >= 0);
ALTER TABLE "CommissionRule" ADD CONSTRAINT "rule_rate_range" CHECK ("rateBps" IS NULL OR ("rateBps" >= 0 AND "rateBps" <= 10000));
ALTER TABLE "CommissionRule" ADD CONSTRAINT "rule_effective_window" CHECK ("effectiveTo" IS NULL OR "effectiveTo" > "effectiveFrom");

-- Maker-checker separation enforced in the database as well as the service layer
ALTER TABLE "PayoutBatch" ADD CONSTRAINT "payout_batch_maker_checker" CHECK ("approvedById" IS NULL OR "approvedById" <> "createdById");
ALTER TABLE "PayoutAttempt" ADD CONSTRAINT "payout_attempt_maker_checker" CHECK ("confirmedById" IS NULL OR "confirmedById" <> "recordedById");
ALTER TABLE "CommissionRule" ADD CONSTRAINT "rule_maker_checker" CHECK ("approvedById" IS NULL OR "createdById" IS NULL OR "approvedById" <> "createdById");

-- No self referral
ALTER TABLE "AgentReferral" ADD CONSTRAINT "referral_not_self" CHECK ("referrerAgentId" <> "recruitAgentId");

-- One live referrer per recruit; one live attribution per merchant
CREATE UNIQUE INDEX "agent_referral_one_live_per_recruit" ON "AgentReferral"("recruitAgentId") WHERE "endedAt" IS NULL;
CREATE UNIQUE INDEX "merchant_attribution_one_open" ON "MerchantAttribution"("merchantId") WHERE "effectiveTo" IS NULL;

-- One open withdrawal per agent (blocks concurrent duplicate withdrawals)
CREATE UNIQUE INDEX "withdrawal_one_open_per_agent" ON "WithdrawalRequest"("agentId")
  WHERE "status" IN ('REQUESTED','APPROVED','IN_BATCH','PROCESSING','FAILED');

-- At most one live payout attempt per withdrawal (blocks duplicate payout execution)
CREATE UNIQUE INDEX "payout_attempt_one_live" ON "PayoutAttempt"("withdrawalId")
  WHERE "status" IN ('PENDING','SUBMITTED','CONFIRMED');

-- A device can only be active at one merchant at a time
CREATE UNIQUE INDEX "activation_one_live_per_device" ON "Activation"("deviceId") WHERE "deactivatedAt" IS NULL;

-- One active bank account per (agent, account) and one verified KYC id
CREATE UNIQUE INDEX "bank_account_unique_live" ON "AgentBankAccount"("agentId","accountNumberHash") WHERE "status" <> 'ARCHIVED';

-- Append-only tables
CREATE OR REPLACE FUNCTION hausjo_forbid_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'table % is append-only', TG_TABLE_NAME USING ERRCODE = 'check_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ledger_entry_append_only BEFORE UPDATE OR DELETE ON "CommissionLedgerEntry"
  FOR EACH ROW EXECUTE FUNCTION hausjo_forbid_mutation();
CREATE TRIGGER ledger_journal_append_only BEFORE UPDATE OR DELETE ON "LedgerJournal"
  FOR EACH ROW EXECUTE FUNCTION hausjo_forbid_mutation();
CREATE TRIGGER audit_log_append_only BEFORE UPDATE OR DELETE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION hausjo_forbid_mutation();
CREATE TRIGGER referral_commission_append_only BEFORE UPDATE OR DELETE ON "ReferralCommission"
  FOR EACH ROW EXECUTE FUNCTION hausjo_forbid_mutation();

-- Commission events: amount, beneficiary, source and rule snapshot are immutable once written
CREATE OR REPLACE FUNCTION hausjo_commission_event_immutable() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'commission events cannot be deleted' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW."amount" <> OLD."amount" OR NEW."agentId" <> OLD."agentId" OR NEW."eventRef" <> OLD."eventRef"
     OR NEW."type" <> OLD."type" OR NEW."ruleSnapshot"::text <> OLD."ruleSnapshot"::text
     OR NEW."calculation"::text <> OLD."calculation"::text THEN
    RAISE EXCEPTION 'commission event financial fields are immutable' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER commission_event_immutable BEFORE UPDATE OR DELETE ON "CommissionEvent"
  FOR EACH ROW EXECUTE FUNCTION hausjo_commission_event_immutable();

-- Double-entry: every journal must balance at commit time
CREATE OR REPLACE FUNCTION hausjo_check_journal_balanced() RETURNS trigger AS $$
DECLARE
  d NUMERIC; c NUMERIC;
BEGIN
  SELECT COALESCE(SUM(CASE WHEN "direction"='DEBIT' THEN "amount" ELSE 0 END),0),
         COALESCE(SUM(CASE WHEN "direction"='CREDIT' THEN "amount" ELSE 0 END),0)
    INTO d, c FROM "CommissionLedgerEntry" WHERE "journalId" = NEW."journalId";
  IF d <> c THEN
    RAISE EXCEPTION 'ledger journal % unbalanced: debit % credit %', NEW."journalId", d, c USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
CREATE CONSTRAINT TRIGGER ledger_journal_balanced AFTER INSERT ON "CommissionLedgerEntry"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION hausjo_check_journal_balanced();

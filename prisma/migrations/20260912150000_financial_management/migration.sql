-- Price adjustments preserve the procedure price snapshot and expose the final negotiated total.
CREATE TYPE "PriceAdjustmentType" AS ENUM ('DISCOUNT', 'ADDITIONAL');
CREATE TYPE "FinancialTransactionType" AS ENUM ('INCOME', 'EXPENSE');

ALTER TABLE "appointments"
  ADD COLUMN "basePrice" DECIMAL(10,2),
  ADD COLUMN "priceAdjustmentType" "PriceAdjustmentType",
  ADD COLUMN "priceAdjustmentAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN "priceAdjustmentReason" TEXT;

UPDATE "appointments"
SET "basePrice" = COALESCE("totalPrice", 0);

-- Unified ledger. Appointment income is synchronized automatically by the API.
CREATE TABLE "financial_transactions" (
  "id" TEXT NOT NULL,
  "type" "FinancialTransactionType" NOT NULL,
  "category" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "amount" DECIMAL(10,2) NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "paymentMethod" TEXT,
  "notes" TEXT,
  "appointmentId" TEXT,
  "adminUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "financial_transactions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "financial_transactions_appointmentId_key"
  ON "financial_transactions"("appointmentId");
CREATE INDEX "financial_transactions_type_occurredAt_idx"
  ON "financial_transactions"("type", "occurredAt");
CREATE INDEX "financial_transactions_category_idx"
  ON "financial_transactions"("category");

ALTER TABLE "financial_transactions"
  ADD CONSTRAINT "financial_transactions_appointmentId_fkey"
  FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "financial_transactions"
  ADD CONSTRAINT "financial_transactions_adminUserId_fkey"
  FOREIGN KEY ("adminUserId") REFERENCES "admin_users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "financial_transactions" (
  "id", "type", "category", "description", "amount", "occurredAt",
  "paymentMethod", "appointmentId", "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid()::text,
  'INCOME'::"FinancialTransactionType",
  'Atendimentos',
  'Pagamento de agendamento',
  "amountPaid",
  COALESCE("confirmedAt", "updatedAt", "createdAt"),
  'Pix',
  "id",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "appointments"
WHERE "amountPaid" > 0;

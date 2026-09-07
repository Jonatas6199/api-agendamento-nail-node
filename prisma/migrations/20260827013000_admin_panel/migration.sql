-- Administrative users and revocable browser sessions
CREATE TABLE "admin_users" (
  "id" TEXT NOT NULL,
  "username" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "admin_users_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "admin_sessions" (
  "id" TEXT NOT NULL,
  "adminUserId" TEXT NOT NULL,
  "apiKeyHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "admin_sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "admin_users_username_key" ON "admin_users"("username");
CREATE UNIQUE INDEX "admin_sessions_apiKeyHash_key" ON "admin_sessions"("apiKeyHash");
CREATE INDEX "admin_sessions_adminUserId_idx" ON "admin_sessions"("adminUserId");
CREATE INDEX "admin_sessions_expiresAt_idx" ON "admin_sessions"("expiresAt");

ALTER TABLE "admin_sessions"
  ADD CONSTRAINT "admin_sessions_adminUserId_fkey"
  FOREIGN KEY ("adminUserId") REFERENCES "admin_users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Operational information needed by the administrative panel
ALTER TABLE "appointments"
  ADD COLUMN "totalPrice" DECIMAL(10,2),
  ADD COLUMN "amountPaid" DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN "remainingPaymentMethod" TEXT,
  ADD COLUMN "notes" TEXT,
  ADD COLUMN "confirmedAt" TIMESTAMP(3),
  ADD COLUMN "completedAt" TIMESTAMP(3),
  ADD COLUMN "cancelledAt" TIMESTAMP(3);

UPDATE "appointments" AS appointment
SET "totalPrice" = procedure."price"
FROM "procedures" AS procedure
WHERE procedure."id" = appointment."procedureId";

UPDATE "appointments" AS appointment
SET "totalPrice" = procedure."price"
FROM "procedures" AS procedure
WHERE procedure."id" = appointment."procedureId";

-- Existing scheduled records were already treated as confirmed by the legacy app.
UPDATE "appointments"
SET "confirmedAt" = "createdAt"
WHERE "status" = 'SCHEDULED';

UPDATE "appointments"
SET "completedAt" = "updatedAt"
WHERE "status" = 'COMPLETED';

UPDATE "appointments"
SET "cancelledAt" = "updatedAt"
WHERE "status" = 'CANCELLED';

CREATE INDEX "appointments_status_startTime_idx"
  ON "appointments"("status", "startTime");

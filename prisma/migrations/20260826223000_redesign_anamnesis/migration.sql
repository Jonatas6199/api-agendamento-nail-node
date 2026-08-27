-- Rename compatible fields to preserve existing answers
ALTER TABLE "anamnesis_forms"
  RENAME COLUMN "hasAllergies" TO "hasCosmeticAllergy";

ALTER TABLE "anamnesis_forms"
  RENAME COLUMN "allergiesDetails" TO "cosmeticAllergyDetails";

ALTER TABLE "anamnesis_forms"
  RENAME COLUMN "medicationsInUse" TO "continuousMedicationDetails";

-- Add the fields used by the redesigned anamnesis form
ALTER TABLE "anamnesis_forms"
  ADD COLUMN "isFirstVisit" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "usesGelPolish" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "hasFrequentLifting" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "usesContinuousMedication" BOOLEAN NOT NULL DEFAULT false;

-- Preserve the meaning of existing medication descriptions
UPDATE "anamnesis_forms"
SET "usesContinuousMedication" = true
WHERE NULLIF(BTRIM("continuousMedicationDetails"), '') IS NOT NULL;

-- The obsolete columns are intentionally kept in PostgreSQL for historical
-- data compatibility. They are no longer mapped by Prisma or used by the API.

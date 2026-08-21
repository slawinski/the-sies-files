-- AlterEnum
ALTER TYPE "NominationStatus" ADD VALUE 'DAY_TRIGGER_RESOLUTION';

-- AlterTable
ALTER TABLE "nominations" ADD COLUMN     "decisionJson" JSONB;

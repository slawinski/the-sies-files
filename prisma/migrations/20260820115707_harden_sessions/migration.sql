/*
  Warnings:

  - The `status` column on the `command_receipts` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - Added the required column `expiresAt` to the `browser_sessions` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "CommandReceiptStatus" AS ENUM ('APPLIED');

-- AlterTable
ALTER TABLE "browser_sessions" ADD COLUMN     "expiresAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "command_receipts" DROP COLUMN "status",
ADD COLUMN     "status" "CommandReceiptStatus" NOT NULL DEFAULT 'APPLIED';

-- Constraint: a browser session is EITHER a player session OR a storyteller
-- session, never both and never neither (docs/01 §18 — distinct auth boundaries).
ALTER TABLE "browser_sessions"
ADD CONSTRAINT "browser_sessions_identity_xor"
CHECK (("playerId" IS NULL) <> ("storytellerGameId" IS NULL));

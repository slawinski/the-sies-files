-- Historical identity is unknown. Preserve rows and unwrapped result JSON.
ALTER TABLE "command_receipts"
  ADD COLUMN "operation" TEXT,
  ADD COLUMN "actor" TEXT,
  ADD COLUMN "resultVersion" INTEGER,
  ADD COLUMN "requestHash" TEXT;

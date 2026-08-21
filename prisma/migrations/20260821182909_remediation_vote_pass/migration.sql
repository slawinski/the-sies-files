-- AlterTable
ALTER TABLE "nominations" ADD COLUMN     "currentVirtualSeat" INTEGER,
ADD COLUMN     "passStatus" TEXT NOT NULL DEFAULT 'READY';

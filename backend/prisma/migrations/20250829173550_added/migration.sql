-- CreateEnum
CREATE TYPE "public"."Status" AS ENUM ('OPEN', 'IN_PROGRESS', 'COMPLETED');

-- AlterTable
ALTER TABLE "public"."Task" ADD COLUMN     "status" "public"."Status" NOT NULL DEFAULT 'OPEN';

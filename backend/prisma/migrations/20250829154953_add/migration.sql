-- AlterTable
ALTER TABLE "public"."Sprint" ADD COLUMN     "description" TEXT NOT NULL DEFAULT '',
ALTER COLUMN "name" SET DEFAULT '';

-- AlterTable
ALTER TABLE "public"."Task" ADD COLUMN     "description" TEXT NOT NULL DEFAULT '';

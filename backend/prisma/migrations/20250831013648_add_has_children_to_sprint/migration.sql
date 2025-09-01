-- DropForeignKey
ALTER TABLE "public"."Task" DROP CONSTRAINT "Task_assignedTo_fkey";

-- AlterTable
ALTER TABLE "public"."Sprint" ADD COLUMN     "hasChildren" BOOLEAN NOT NULL DEFAULT false;

/*
  Warnings:

  - You are about to drop the column `has_children` on the `Task` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "public"."Task" DROP COLUMN "has_children",
ADD COLUMN     "hasChildren" BOOLEAN NOT NULL DEFAULT false;

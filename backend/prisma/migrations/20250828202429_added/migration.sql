/*
  Warnings:

  - A unique constraint covering the columns `[auth0Id]` on the table `User` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `auth0Id` to the `User` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "public"."User" ADD COLUMN     "auth0Id" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "User_auth0Id_key" ON "public"."User"("auth0Id");

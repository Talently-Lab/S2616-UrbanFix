/*
  Warnings:

  - Changed the type of `categoria` on the `SolicitudServicio` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- AlterTable
ALTER TABLE "SolicitudServicio" DROP COLUMN "categoria",
ADD COLUMN     "categoria" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Usuario" ADD COLUMN     "lastLogin" TIMESTAMP(3);

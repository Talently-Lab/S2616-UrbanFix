-- CreateEnum
CREATE TYPE "Rol" AS ENUM ('CLIENTE', 'TECNICO', 'ADMIN');

-- CreateEnum
CREATE TYPE "EstadoSolicitud" AS ENUM ('PENDIENTE', 'ACEPTADA', 'RECHAZADA', 'EN_PROCESO', 'FINALIZADA', 'CANCELADA');

-- CreateTable
CREATE TABLE "Usuario" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "celular" TEXT,
    "rol" "Rol" NOT NULL DEFAULT 'CLIENTE',
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaActualizacion" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SolicitudServicio" (
    "id" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "categoria" TEXT NOT NULL,
    "direccion" TEXT NOT NULL,
    "estado" "EstadoSolicitud" NOT NULL DEFAULT 'PENDIENTE',
    "clienteId" TEXT NOT NULL,
    "tecnicoId" TEXT,
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaActualizacion" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SolicitudServicio_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_email_key" ON "Usuario"("email");

-- AddForeignKey
ALTER TABLE "SolicitudServicio" ADD CONSTRAINT "SolicitudServicio_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SolicitudServicio" ADD CONSTRAINT "SolicitudServicio_tecnicoId_fkey" FOREIGN KEY ("tecnicoId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

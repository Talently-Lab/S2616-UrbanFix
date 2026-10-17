-- AlterTable
ALTER TABLE "HistorialEstadoSolicitud" ADD COLUMN "accion" TEXT;

-- CreateTable
CREATE TABLE "RechazoSolicitud" (
    "id" TEXT NOT NULL,
    "solicitudId" TEXT NOT NULL,
    "tecnicoId" TEXT NOT NULL,
    "motivo" TEXT NOT NULL,
    "fechaRechazo" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RechazoSolicitud_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RechazoSolicitud_solicitudId_idx" ON "RechazoSolicitud"("solicitudId");

-- CreateIndex
CREATE INDEX "RechazoSolicitud_tecnicoId_idx" ON "RechazoSolicitud"("tecnicoId");

-- CreateIndex
CREATE UNIQUE INDEX "RechazoSolicitud_solicitudId_tecnicoId_key" ON "RechazoSolicitud"("solicitudId", "tecnicoId");

-- AddForeignKey
ALTER TABLE "RechazoSolicitud" ADD CONSTRAINT "RechazoSolicitud_solicitudId_fkey" FOREIGN KEY ("solicitudId") REFERENCES "SolicitudServicio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RechazoSolicitud" ADD CONSTRAINT "RechazoSolicitud_tecnicoId_fkey" FOREIGN KEY ("tecnicoId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

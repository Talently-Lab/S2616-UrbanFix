import TablaSolicitudes from '../../components/admin/TablaSolicitudes'
import { useSolicitudes } from '../../hooks/useSolicitudes'

// A2 — Listado de solicitudes de la plataforma (Figma pág. 04).
// La tabla vive en components/admin/TablaSolicitudes.jsx (Semana 6) y se
// reutiliza en el centro de control (Dashboard).
export default function AdminSolicitudes() {
  const { solicitudes, status, error, recargar } = useSolicitudes({ limit: 100 })

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-3xl font-bold text-text">Solicitudes</h1>
        <p className="mt-1 text-text-muted">
          Todas las solicitudes de la plataforma. Elegí una para verla o cancelarla.
        </p>
      </header>

      <TablaSolicitudes
        solicitudes={solicitudes}
        status={status}
        error={error}
        recargar={recargar}
      />
    </div>
  )
}

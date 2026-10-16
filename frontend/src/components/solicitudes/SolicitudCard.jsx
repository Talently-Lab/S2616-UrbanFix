// D2 — SolicitudCard (inventario de UX/UI, §2): título, categoría, fecha
// y estado, con y sin técnico asignado. Usa D1 EstadoSolicitudBadge.
// Falta la forma visual del Figma; por ahora va con los tokens del sistema.

import { Link } from 'react-router-dom'
import EstadoSolicitudBadge from './EstadoSolicitudBadge'
import { etiquetaCategoria } from '../../constants/categorias'

function formatearFecha(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

export default function SolicitudCard({ solicitud, to }) {
  const { titulo, categoria, estado, fechaCreacion, tecnico } = solicitud

  const contenido = (
    <>
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-semibold text-text">{titulo}</h3>
        <EstadoSolicitudBadge estado={estado} className="shrink-0" />
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text-muted">
        <span>{etiquetaCategoria(categoria)}</span>
        <span>{formatearFecha(fechaCreacion)}</span>
        <span>{tecnico?.nombre ? `Técnico: ${tecnico.nombre}` : 'Sin técnico asignado'}</span>
      </div>
    </>
  )

  const clases =
    'block rounded-card border border-border bg-surface p-4 transition-colors hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary'

  if (to) {
    return (
      <Link to={to} className={clases}>
        {contenido}
      </Link>
    )
  }

  return <div className={clases}>{contenido}</div>
}

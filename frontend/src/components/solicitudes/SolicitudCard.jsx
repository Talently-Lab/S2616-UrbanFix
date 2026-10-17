import { Link } from 'react-router-dom'
import EstadoSolicitudBadge from './EstadoSolicitudBadge'
import { etiquetaCategoria } from '../../constants/categorias'

function fechaCorta(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })
}

function hace(iso) {
  const fecha = new Date(iso)
  const minutos = Math.round((Date.now() - fecha.getTime()) / 60000)
  if (minutos < 1) return 'hace un momento'
  if (minutos < 60) return `hace ${minutos} min`
  const horas = Math.round(minutos / 60)
  if (horas < 24) return `hace ${horas} h`
  const dias = Math.round(horas / 24)
  if (dias < 7) return `hace ${dias} d`
  return `el ${fechaCorta(fecha)}`
}

export default function SolicitudCard({ solicitud, to, momento = 'fecha', acciones = null }) {
  const { titulo, categoria, estado, fechaCreacion, direccion } = solicitud

  const meta = direccion
    ? momento === 'relativo'
      ? `${direccion} · Publicada ${hace(fechaCreacion)}`
      : `${direccion} · Creada el ${fechaCorta(fechaCreacion)}`
    : momento === 'relativo'
      ? `Publicada ${hace(fechaCreacion)}`
      : `Creada el ${fechaCorta(fechaCreacion)}`

  const contenido = (
    <div className="flex flex-col gap-2">
      <div className="flex items-start justify-between gap-3">
        <span className="text-xs font-medium uppercase tracking-wide text-text-muted">
          {etiquetaCategoria(categoria)}
        </span>
        <EstadoSolicitudBadge estado={estado} className="shrink-0" />
      </div>
      <div className="flex flex-col gap-1.5">
        <h3 className="text-lg font-semibold leading-6 text-text">{titulo}</h3>
        <p className="text-sm text-text-muted">{meta}</p>
      </div>
      {acciones ? <div className="flex gap-3 pt-1">{acciones}</div> : null}
    </div>
  )

  const clases =
    'block rounded-card border border-border bg-surface p-5 transition-colors hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary'

  if (to) {
    return (
      <Link to={to} className={clases}>
        {contenido}
      </Link>
    )
  }

  return <article className={clases}>{contenido}</article>
}

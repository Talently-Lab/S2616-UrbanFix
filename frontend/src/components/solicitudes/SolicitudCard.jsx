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

// T6 — meta «Av. Siempre Viva 742 · Aceptada el 12/10» (o Finalizada/Publicada).
function metaMiTrabajo({ direccion, estado, fechaCreacion, fechaAceptacion, fechaFinalizacion }) {
  let accion = 'Publicada'
  let fecha = fechaCreacion
  if (estado === 'FINALIZADA') {
    accion = 'Finalizada'
    fecha = fechaFinalizacion ?? fechaAceptacion ?? fechaCreacion
  } else if (fechaAceptacion) {
    accion = 'Aceptada'
    fecha = fechaAceptacion
  }
  const sufijo = `${accion} el ${fechaCorta(fecha)}`
  return direccion ? `${direccion} · ${sufijo}` : sufijo
}

export default function SolicitudCard({ solicitud, to, momento = 'fecha', acciones = null }) {
  const { titulo, categoria, estado, fechaCreacion, direccion } = solicitud

  let meta
  if (momento === 'relativo') {
    const texto = `Publicada ${hace(fechaCreacion)}`
    meta = direccion ? `${direccion} · ${texto}` : texto
  } else if (momento === 'miTrabajo') {
    meta = metaMiTrabajo(solicitud)
  } else {
    const texto = `Creada el ${fechaCorta(fechaCreacion)}`
    meta = direccion ? `${direccion} · ${texto}` : texto
  }

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

  if (to && !acciones) {
    return (
      <Link to={to} className={clases}>
        {contenido}
      </Link>
    )
  }

  // Con acciones no se puede envolver todo en un <Link> (botones anidados):
  // el título queda como link al detalle y los botones viven fuera del anchor.
  if (to && acciones) {
    return (
      <article className={clases}>
        <div className="flex flex-col gap-2">
          <div className="flex items-start justify-between gap-3">
            <span className="text-xs font-medium uppercase tracking-wide text-text-muted">
              {etiquetaCategoria(categoria)}
            </span>
            <EstadoSolicitudBadge estado={estado} className="shrink-0" />
          </div>
          <div className="flex flex-col gap-1.5">
            <h3 className="text-lg font-semibold leading-6 text-text">
              <Link
                to={to}
                className="rounded underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                {titulo}
              </Link>
            </h3>
            <p className="text-sm text-text-muted">{meta}</p>
          </div>
          <div className="flex gap-3 pt-1">{acciones}</div>
        </div>
      </article>
    )
  }

  return <article className={clases}>{contenido}</article>
}

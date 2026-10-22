import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Button, ButtonLink, ErrorAlert, Spinner } from '../../components/ui'
import EstadoSolicitudBadge from '../../components/solicitudes/EstadoSolicitudBadge'
import { etiquetaCategoria } from '../../constants/categorias'
import { useToast } from '../../hooks/useToast'
import { finalizar, obtener, iniciar, historial as obtenerHistorial } from '../../services/solicitudes'

const BANNERS = {
  ACEPTADA: 'Aceptaste este trabajo. Cuando llegues, tocá «Iniciar trabajo».',
  EN_PROCESO: 'Trabajo en curso. Al terminar, tocá «Finalizar trabajo».',
  FINALIZADA: 'Trabajo finalizado. ¡Buen trabajo!',
  CANCELADA: 'El cliente canceló este trabajo.',
}

function fechaHora(iso) {
  const fecha = new Date(iso)
  const dia = fecha.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })
  const hora = fecha.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
  return `${dia} · ${hora}`
}

function etiquetaEvento(evento) {
  if (evento.accion === 'RECHAZO') return 'Rechazo de un técnico'
  if (!evento.estadoAnterior) return 'Solicitud creada'
  if (evento.estadoNuevo === 'ACEPTADA') return 'Aceptaste el trabajo'
  if (evento.estadoNuevo === 'EN_PROCESO') return 'Trabajo iniciado'
  if (evento.estadoNuevo === 'FINALIZADA') return 'Trabajo finalizado'
  if (evento.estadoNuevo === 'CANCELADA') return 'Trabajo cancelado'
  return 'Actualización del trabajo'
}

function Campo({ label, children }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm text-text-muted">{label}</span>
      <span className="text-base text-text">{children}</span>
    </div>
  )
}

// T7 — Detalle de mi trabajo aceptado (Figma pág. 04): aceptada, en proceso y finalizada.
export default function TecnicoDetalleTrabajo() {
  const { id } = useParams()
  const { show } = useToast()

  const [intento, setIntento] = useState(0)
  const clave = `${id}#${intento}`
  const [resultado, setResultado] = useState({
    clave,
    status: 'loading',
    solicitud: null,
    eventos: [],
    error: null,
  })
  const [accion, setAccion] = useState(null)

  useEffect(() => {
    let cancelado = false

    Promise.all([obtener(id), obtenerHistorial(id).catch(() => [])])
      .then(([detalle, historial]) => {
        if (cancelado) return
        setResultado({
          clave,
          status: 'ready',
          solicitud: detalle,
          eventos: [...historial].reverse(),
          error: null,
        })
      })
      .catch((err) => {
        if (cancelado) return
        setResultado({
          clave,
          status: 'error',
          solicitud: null,
          eventos: [],
          error: err.message ?? 'No pudimos cargar el trabajo',
        })
      })

    return () => {
      cancelado = true
    }
  }, [clave, id])

  const vigente = resultado.clave === clave
  const status = vigente ? resultado.status : 'loading'
  const solicitud = vigente ? resultado.solicitud : null
  const eventos = vigente ? resultado.eventos : []
  const error = vigente ? resultado.error : null

  if (status === 'loading') {
    return (
      <div className="flex justify-center py-16">
        <Spinner size="lg" />
      </div>
    )
  }

  if (status === 'error') {
    return <ErrorAlert message={error} onRetry={() => setIntento((valor) => valor + 1)} />
  }

  const { estado } = solicitud

  async function manejarAccion(tipo) {
    setAccion(tipo)
    try {
      if (tipo === 'iniciar') {
        await iniciar(id)
        show('Trabajo iniciado', 'success')
      } else {
        await finalizar(id)
        show('Trabajo finalizado', 'success')
      }
      setIntento((valor) => valor + 1)
    } catch (err) {
      show(err.message, 'error')
      setIntento((valor) => valor + 1)
    } finally {
      setAccion(null)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <h1 className="text-3xl font-bold leading-9 text-text">{solicitud.titulo}</h1>
        <EstadoSolicitudBadge estado={estado} className="self-start" />
      </div>

      {estado === 'PENDIENTE' ? (
        <p role="status" className="rounded-card bg-warning-soft px-4 py-3 text-sm text-[#92400E]">
          Este trabajo todavía no está aceptado.
        </p>
      ) : BANNERS[estado] ? (
        <p role="status" className="rounded-card bg-info-soft px-4 py-3 text-sm text-primary-hover">
          {BANNERS[estado]}
        </p>
      ) : null}

      <section className="flex flex-col gap-4 rounded-card border border-border bg-surface p-5">
        <Campo label="Cliente">{solicitud.cliente?.nombre ?? '—'}</Campo>
        <Campo label="Celular">{solicitud.cliente?.celular ?? 'Sin cargar'}</Campo>
        <Campo label="Categoría">{etiquetaCategoria(solicitud.categoria)}</Campo>
        <Campo label="Dirección">{solicitud.direccion}</Campo>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-bold text-text">Historial</h2>
        <ul className="flex flex-col gap-4">
          {eventos.map((evento) => (
            <li key={evento.id ?? evento.fechaCambio} className="flex flex-col gap-1">
              <p className="text-sm font-semibold text-text">{etiquetaEvento(evento)}</p>
              <p className="text-sm text-text-muted">
                {evento.cambiadoPor?.nombre ?? '—'} · {fechaHora(evento.fechaCambio)}
              </p>
            </li>
          ))}
        </ul>
      </section>

      {estado === 'ACEPTADA' ? (
        <div className="flex flex-col gap-3 pb-4">
          <Button
            className="w-full"
            loading={accion === 'iniciar'}
            onClick={() => manejarAccion('iniciar')}
          >
            Iniciar trabajo
          </Button>
        </div>
      ) : estado === 'EN_PROCESO' ? (
        <div className="flex flex-col gap-3 pb-4">
          <Button
            className="w-full"
            loading={accion === 'finalizar'}
            onClick={() => manejarAccion('finalizar')}
          >
            Finalizar trabajo
          </Button>
        </div>
      ) : estado === 'PENDIENTE' ? (
        <div className="flex flex-col gap-3 pb-4">
          <ButtonLink variant="secondary" className="w-full" to="/tecnico/disponibles">
            Ver trabajos disponibles
          </ButtonLink>
        </div>
      ) : null}
    </div>
  )
}

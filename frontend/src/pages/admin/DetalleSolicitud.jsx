import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Button, ErrorAlert, Input, Modal, Spinner } from '../../components/ui'
import EstadoSolicitudBadge from '../../components/solicitudes/EstadoSolicitudBadge'
import { etiquetaCategoria } from '../../constants/categorias'
import { useToast } from '../../hooks/useToast'
import { cancelar, historial as obtenerHistorial, obtener } from '../../services/solicitudes'

function fechaLarga(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function fechaHora(iso) {
  const fecha = new Date(iso)
  const dia = fecha.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })
  const hora = fecha.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false })
  return `${dia} · ${hora}`
}

function etiquetaEvento(evento) {
  if (evento.accion === 'RECHAZO') return 'Solicitud rechazada'
  if (!evento.estadoAnterior) return 'Solicitud creada'
  if (evento.estadoNuevo === 'ACEPTADA') return 'Solicitud aceptada'
  if (evento.estadoNuevo === 'EN_PROCESO') return 'Trabajo iniciado'
  if (evento.estadoNuevo === 'FINALIZADA') return 'Trabajo finalizado'
  if (evento.estadoNuevo === 'CANCELADA') return 'Solicitud cancelada'
  return 'Actualización de la solicitud'
}

function Campo({ label, children }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm text-text-muted">{label}</span>
      <span className="text-base text-text">{children}</span>
    </div>
  )
}

function Tarjeta({ titulo, children }) {
  return (
    <section className="flex flex-col gap-4 rounded-card border border-border bg-surface p-5">
      <h2 className="text-lg font-semibold text-text">{titulo}</h2>
      {children}
    </section>
  )
}

// A3/A4 — Detalle de una solicitud (admin) con modal de cancelación.
export default function AdminDetalleSolicitud() {
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

  const [cancelando, setCancelando] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [errorMotivo, setErrorMotivo] = useState(null)
  const [errorCancelar, setErrorCancelar] = useState(null)
  const [enviandoCancelar, setEnviandoCancelar] = useState(false)

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
          error: err.message ?? 'No pudimos cargar la solicitud',
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
    return (
      <div className="flex flex-col gap-4">
        <Link to="/admin/solicitudes" className="text-sm font-medium text-primary">
          ‹ Solicitudes
        </Link>
        <ErrorAlert message={error} onRetry={() => setIntento((valor) => valor + 1)} />
      </div>
    )
  }

  const sePuedeCancelar = ['PENDIENTE', 'ACEPTADA'].includes(solicitud.estado)

  function abrirCancelacion() {
    setMotivo('')
    setErrorMotivo(null)
    setErrorCancelar(null)
    setCancelando(true)
  }

  async function manejarCancelar() {
    if (!motivo.trim()) {
      setErrorMotivo('El motivo es obligatorio.')
      return
    }
    setEnviandoCancelar(true)
    setErrorCancelar(null)
    try {
      await cancelar(id, motivo)
      show('Solicitud cancelada', 'success')
      setCancelando(false)
      setIntento((valor) => valor + 1)
    } catch (err) {
      setErrorCancelar(err.message)
    } finally {
      setEnviandoCancelar(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Link to="/admin/solicitudes" className="text-sm font-medium text-primary">
        ‹ Solicitudes
      </Link>

      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-bold text-text">{solicitud.titulo}</h1>
        <EstadoSolicitudBadge estado={solicitud.estado} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Tarjeta titulo="Solicitud">
          <Campo label="Categoría">{etiquetaCategoria(solicitud.categoria)}</Campo>
          <Campo label="Dirección">{solicitud.direccion}</Campo>
          <Campo label="Descripción">{solicitud.descripcion}</Campo>
          <Campo label="Creada">{fechaLarga(solicitud.fechaCreacion)}</Campo>
        </Tarjeta>

        <Tarjeta titulo="Personas">
          <Campo label="Cliente">{solicitud.cliente?.nombre ?? '—'}</Campo>
          <Campo label="Celular del cliente">{solicitud.cliente?.celular ?? 'Sin cargar'}</Campo>
          <Campo label="Técnico">{solicitud.tecnico?.nombre ?? 'Sin asignar'}</Campo>
          <Campo label="Celular del técnico">
            {solicitud.tecnico?.celular ?? (solicitud.tecnico ? 'Sin cargar' : '—')}
          </Campo>
        </Tarjeta>
      </div>

      <Tarjeta titulo="Historial">
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
      </Tarjeta>

      {sePuedeCancelar ? (
        <div className="flex flex-col gap-2 pb-4">
          <div>
            <Button variant="danger" onClick={abrirCancelacion}>
              Cancelar solicitud
            </Button>
          </div>
          <p className="max-w-md text-sm text-text-muted">
            Solo se puede cancelar una solicitud pendiente o aceptada. Un trabajo en proceso no se
            cancela.
          </p>
        </div>
      ) : null}

      <Modal
        open={cancelando}
        onClose={() => setCancelando(false)}
        title="¿Cancelar esta solicitud?"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCancelando(false)} disabled={enviandoCancelar}>
              Volver
            </Button>
            <Button variant="danger" loading={enviandoCancelar} onClick={manejarCancelar}>
              Cancelar solicitud
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm text-text-muted">
            Se avisará al cliente y al técnico. Esta acción no se puede deshacer.
          </p>
          {errorCancelar ? <ErrorAlert message={errorCancelar} /> : null}
          <Input
            label="Motivo (obligatorio)"
            placeholder="Escribí el motivo"
            value={motivo}
            onChange={(event) => {
              setMotivo(event.target.value)
              setErrorMotivo(null)
            }}
            error={errorMotivo}
          />
        </div>
      </Modal>
    </div>
  )
}

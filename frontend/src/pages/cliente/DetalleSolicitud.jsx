import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Button, ErrorAlert, Input, Modal, Select, Spinner, Textarea } from '../../components/ui'
import EstadoSolicitudBadge from '../../components/solicitudes/EstadoSolicitudBadge'
import { etiquetaCategoria, opcionesCategorias } from '../../constants/categorias'
import { cancelar, editar, obtener, historial as obtenerHistorial } from '../../services/solicitudes'

const OPCIONES_CATEGORIA = [{ value: '', label: 'Elegí una categoría' }, ...opcionesCategorias()]

const BANNERS = {
  PENDIENTE: { texto: 'Estamos buscando un técnico para tu solicitud.', tono: 'warning' },
  ACEPTADA: { texto: 'Un técnico tomó tu solicitud.', tono: 'info' },
  EN_PROCESO: { texto: 'El técnico está trabajando en tu solicitud.', tono: 'info' },
  FINALIZADA: { texto: 'El trabajo fue finalizado.', tono: 'info' },
  RECHAZADA: { texto: 'Ningún técnico pudo tomar esta solicitud.', tono: 'warning' },
}

const TONO = {
  warning: 'bg-warning-soft text-[#92400E]',
  info: 'bg-info-soft text-primary-hover',
}

const CAMPOS = ['titulo', 'categoria', 'descripcion', 'direccion']

function validarEdicion({ titulo, categoria, descripcion, direccion }) {
  const errores = {}
  if (!titulo.trim()) errores.titulo = 'El título es obligatorio'
  if (!categoria) errores.categoria = 'Elegí la categoría del servicio.'
  if (descripcion.trim().length < 10) {
    errores.descripcion = 'Contanos un poco más (mínimo 10 caracteres).'
  }
  if (!direccion.trim()) errores.direccion = 'La dirección es obligatoria'
  return errores
}

function fechaLarga(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function fechaHora(iso) {
  const fecha = new Date(iso)
  const dia = fecha.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })
  const hora = fecha.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
  return `${dia} · ${hora}`
}

function etiquetaEvento(evento) {
  if (evento.accion === 'RECHAZO') return 'Solicitud rechazada'
  if (!evento.estadoAnterior) return 'Solicitud creada'
  if (evento.estadoNuevo === 'CANCELADA') return 'Solicitud cancelada'
  const etiquetas = {
    'PENDIENTE>ACEPTADA': 'Solicitud aceptada',
    'ACEPTADA>EN_PROCESO': 'Trabajo iniciado',
    'EN_PROCESO>FINALIZADA': 'Trabajo finalizado',
  }
  return etiquetas[`${evento.estadoAnterior}>${evento.estadoNuevo}`] ?? 'Actualización de la solicitud'
}

function Campo({ label, children }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm text-text-muted">{label}</span>
      <span className="text-base text-text">{children}</span>
    </div>
  )
}

export default function ClienteDetalleSolicitud() {
  const { id } = useParams()
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

  const [editando, setEditando] = useState(false)
  const [form, setForm] = useState(null)
  const [errores, setErrores] = useState({})
  const [errorEditar, setErrorEditar] = useState(null)
  const [enviandoEditar, setEnviandoEditar] = useState(false)

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
    return <ErrorAlert message={error} onRetry={() => setIntento((valor) => valor + 1)} />
  }

  const { estado } = solicitud
  const conTecnico = ['ACEPTADA', 'EN_PROCESO', 'FINALIZADA'].includes(estado)
  const banner = BANNERS[estado] ??
    (estado === 'CANCELADA'
      ? {
          texto: `Cancelaste esta solicitud. Motivo: «${solicitud.motivoCancelacion ?? 'sin motivo'}».`,
          tono: 'info',
        }
      : null)

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
      setCancelando(false)
      setIntento((valor) => valor + 1)
    } catch (err) {
      setErrorCancelar(err.message)
    } finally {
      setEnviandoCancelar(false)
    }
  }

  function abrirEdicion() {
    setForm({
      titulo: solicitud.titulo,
      categoria: solicitud.categoria,
      descripcion: solicitud.descripcion,
      direccion: solicitud.direccion,
    })
    setErrores({})
    setErrorEditar(null)
    setEditando(true)
  }

  function cambiarForm(campo, valor) {
    setForm((actual) => ({ ...actual, [campo]: valor }))
    setErrores((actuales) => {
      if (!actuales[campo]) return actuales
      const siguiente = { ...actuales }
      delete siguiente[campo]
      return siguiente
    })
  }

  async function manejarEditar() {
    const fallas = validarEdicion(form)
    if (Object.keys(fallas).length > 0) {
      setErrores(fallas)
      return
    }
    setEnviandoEditar(true)
    setErrorEditar(null)
    try {
      const actualizada = await editar(id, {
        titulo: form.titulo.trim(),
        categoria: form.categoria,
        descripcion: form.descripcion.trim(),
        direccion: form.direccion.trim(),
      })
      setResultado((prev) => ({ ...prev, solicitud: actualizada }))
      setEditando(false)
    } catch (err) {
      const detalles = Object.fromEntries(
        (err.details ?? [])
          .filter((detalle) => CAMPOS.includes(detalle.field))
          .map((detalle) => [detalle.field, detalle.message]),
      )
      if (Object.keys(detalles).length > 0) setErrores(detalles)
      else setErrorEditar(err.message)
    } finally {
      setEnviandoEditar(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <h1 className="text-3xl font-bold leading-9 text-text">{solicitud.titulo}</h1>
        <EstadoSolicitudBadge estado={estado} className="self-start" />
      </div>

      {banner ? (
        <p role="status" className={`rounded-card px-4 py-3 text-sm ${TONO[banner.tono]}`}>
          {banner.texto}
        </p>
      ) : null}

      <section className="flex flex-col gap-4 rounded-card border border-border bg-surface p-5">
        {conTecnico ? (
          <>
            <Campo label="Técnico">{solicitud.tecnico?.nombre ?? '—'}</Campo>
            <Campo label="Celular">{solicitud.tecnico?.celular ?? 'Sin cargar'}</Campo>
          </>
        ) : null}
        <Campo label="Categoría">{etiquetaCategoria(solicitud.categoria)}</Campo>
        <Campo label="Dirección">{solicitud.direccion}</Campo>
        {estado === 'PENDIENTE' ? (
          <>
            <Campo label="Descripción">{solicitud.descripcion}</Campo>
            <Campo label="Creada">{fechaLarga(solicitud.fechaCreacion)}</Campo>
          </>
        ) : null}
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

      {estado === 'PENDIENTE' ? (
        <div className="flex flex-col gap-3 pb-4">
          <Button variant="secondary" className="w-full" onClick={abrirEdicion}>
            Editar solicitud
          </Button>
          <Button variant="danger" className="w-full" onClick={abrirCancelacion}>
            Cancelar solicitud
          </Button>
        </div>
      ) : estado === 'ACEPTADA' ? (
        <div className="flex flex-col gap-3 pb-4">
          <Button variant="danger" className="w-full" onClick={abrirCancelacion}>
            Cancelar solicitud
          </Button>
        </div>
      ) : null}

      <Modal
        open={cancelando}
        onClose={() => setCancelando(false)}
        title="¿Cancelar esta solicitud?"
        footer={
          <div className="flex w-full flex-col gap-3">
            <Button
              variant="danger"
              className="w-full"
              loading={enviandoCancelar}
              onClick={manejarCancelar}
            >
              Cancelar solicitud
            </Button>
            <Button variant="secondary" className="w-full" onClick={() => setCancelando(false)}>
              Volver
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm text-text-muted">
            Contanos por qué la cancelás. El motivo queda en el historial.
          </p>
          {errorCancelar ? <ErrorAlert message={errorCancelar} /> : null}
          <div className="flex flex-col gap-1">
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
        </div>
      </Modal>

      <Modal
        open={editando}
        onClose={() => setEditando(false)}
        title="Editar solicitud"
        footer={
          <div className="flex w-full flex-col gap-3">
            <Button
              className="w-full"
              loading={enviandoEditar}
              onClick={manejarEditar}
            >
              Guardar cambios
            </Button>
            <Button variant="secondary" className="w-full" onClick={() => setEditando(false)}>
              Volver
            </Button>
          </div>
        }
      >
        {form ? (
          <div className="flex flex-col gap-4">
            {errorEditar ? <ErrorAlert message={errorEditar} /> : null}
            <Input
              label="Título"
              value={form.titulo}
              onChange={(event) => cambiarForm('titulo', event.target.value)}
              error={errores.titulo}
              required
            />
            <Select
              label="Categoría"
              options={OPCIONES_CATEGORIA}
              value={form.categoria}
              onChange={(event) => cambiarForm('categoria', event.target.value)}
              error={errores.categoria}
              required
            />
            <Textarea
              label="Descripción"
              value={form.descripcion}
              onChange={(event) => cambiarForm('descripcion', event.target.value)}
              error={errores.descripcion}
              required
            />
            <Input
              label="Dirección"
              value={form.direccion}
              onChange={(event) => cambiarForm('direccion', event.target.value)}
              error={errores.direccion}
              required
            />
          </div>
        ) : null}
      </Modal>
    </div>
  )
}

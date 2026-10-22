import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Button, ErrorAlert, Modal, Spinner } from '../../components/ui'
import EstadoSolicitudBadge from '../../components/solicitudes/EstadoSolicitudBadge'
import ModalRechazo from '../../components/solicitudes/ModalRechazo'
import { etiquetaCategoria } from '../../constants/categorias'
import { useToast } from '../../hooks/useToast'
import { aceptar, obtener } from '../../services/solicitudes'

function fechaLarga(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function Campo({ label, children, atenuado = false }) {
  const color = atenuado ? 'text-text-muted' : 'text-text'
  const colorLabel = atenuado ? 'text-text-muted/80' : 'text-text-muted'
  return (
    <div className="flex flex-col gap-1">
      <span className={`text-sm ${colorLabel}`}>{label}</span>
      <span className={`text-base ${color}`}>{children}</span>
    </div>
  )
}

// T4 — Detalle de un trabajo disponible (Figma pág. 04):
// estados disponible, confirmación, aceptando, error al aceptar y ya tomado.
export default function TecnicoDetalleDisponible() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { show } = useToast()

  const [intento, setIntento] = useState(0)
  const clave = `${id}#${intento}`
  const [resultado, setResultado] = useState({
    clave,
    status: 'loading',
    solicitud: null,
    yaTomado: false,
    error: null,
  })

  const [confirmando, setConfirmando] = useState(false)
  const [aceptando, setAceptando] = useState(false)
  const [errorAceptar, setErrorAceptar] = useState(null)

  const [rechazando, setRechazando] = useState(false)

  useEffect(() => {
    let cancelado = false

    obtener(id)
      .then((detalle) => {
        if (cancelado) return
        setResultado({
          clave,
          status: 'ready',
          solicitud: detalle,
          yaTomado: detalle.estado !== 'PENDIENTE',
          error: null,
        })
      })
      .catch((err) => {
        if (cancelado) return
        if (err.code === 'NO_DISPONIBLE') {
          setResultado({
            clave,
            status: 'ready',
            solicitud: err.solicitud ?? null,
            yaTomado: true,
            error: null,
          })
          return
        }
        setResultado({
          clave,
          status: 'error',
          solicitud: null,
          yaTomado: false,
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
  const yaTomado = vigente ? resultado.yaTomado : false
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
        <ErrorAlert message={error} onRetry={() => setIntento((valor) => valor + 1)} />
        <Button onClick={() => navigate('/tecnico/disponibles')}>Ver otros trabajos</Button>
      </div>
    )
  }

  if (!solicitud) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-3xl font-bold leading-9 text-text">Trabajo no disponible</h1>
        <p role="alert" className="rounded-card bg-error-soft px-4 py-3 text-sm text-error">
          Este trabajo ya fue tomado por otro técnico. Elegí otro de la lista.
        </p>
        <div className="flex flex-col gap-3 pb-4">
          <Button className="w-full" onClick={() => navigate('/tecnico/disponibles')}>
            Ver otros trabajos
          </Button>
        </div>
      </div>
    )
  }

  async function confirmarAceptacion() {
    setAceptando(true)
    setErrorAceptar(null)
    try {
      await aceptar(id)
      show('Trabajo aceptado. Lo ves en «Mis trabajos».', 'success')
      navigate(`/tecnico/trabajos/${id}`)
    } catch (err) {
      if (/tomada|disponible/i.test(err.message)) {
        setResultado((prev) => ({ ...prev, yaTomado: true }))
      } else {
        setErrorAceptar('No pudimos aceptar el trabajo. Probá de nuevo en unos minutos.')
      }
    } finally {
      setAceptando(false)
      setConfirmando(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <h1 className="text-3xl font-bold leading-9 text-text">{solicitud.titulo}</h1>
        {yaTomado ? null : <EstadoSolicitudBadge estado={solicitud.estado} className="self-start" />}
      </div>

      {yaTomado ? (
        <p role="alert" className="rounded-card bg-error-soft px-4 py-3 text-sm text-error">
          Este trabajo ya fue tomado por otro técnico. Elegí otro de la lista.
        </p>
      ) : errorAceptar ? (
        <ErrorAlert message={errorAceptar} />
      ) : (
        <p role="status" className="rounded-card bg-warning-soft px-4 py-3 text-sm text-[#92400E]">
          Este trabajo está disponible. El primero que lo acepta se lo queda.
        </p>
      )}

      <section
        className={`flex flex-col gap-4 rounded-card border border-border bg-surface p-5 ${
          yaTomado ? 'opacity-70' : ''
        }`}
      >
        <Campo label="Categoría" atenuado={yaTomado}>
          {etiquetaCategoria(solicitud.categoria)}
        </Campo>
        <Campo label="Dirección" atenuado={yaTomado}>
          {solicitud.direccion}
        </Campo>
        <Campo label="Descripción" atenuado={yaTomado}>
          {solicitud.descripcion}
        </Campo>
        <Campo label="Publicada" atenuado={yaTomado}>
          {fechaLarga(solicitud.fechaCreacion)}
        </Campo>
      </section>

      {yaTomado ? (
        <div className="flex flex-col gap-3 pb-4">
          <Button className="w-full" onClick={() => navigate('/tecnico/disponibles')}>
            Ver otros trabajos
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3 pb-4">
          <Button
            className="w-full"
            loading={aceptando}
            onClick={() => setConfirmando(true)}
          >
            Aceptar trabajo
          </Button>
          <Button
            variant="secondary"
            className="w-full"
            disabled={aceptando}
            onClick={() => setRechazando(true)}
          >
            Rechazar
          </Button>
        </div>
      )}

      <Modal
        open={confirmando}
        onClose={() => setConfirmando(false)}
        title="¿Aceptar este trabajo?"
        footer={
          <div className="flex w-full flex-col gap-3">
            <Button className="w-full" loading={aceptando} onClick={confirmarAceptacion}>
              Sí, aceptar
            </Button>
            <Button
              variant="secondary"
              className="w-full"
              onClick={() => setConfirmando(false)}
              disabled={aceptando}
            >
              Volver
            </Button>
          </div>
        }
      >
        <p className="text-sm text-text-muted">
          Vas a atender «{solicitud.titulo}» en {solicitud.direccion}. El cliente verá tu nombre y
          tu celular.
        </p>
      </Modal>

      <ModalRechazo
        solicitud={rechazando ? solicitud : null}
        onClose={() => setRechazando(false)}
        onRechazado={() => navigate('/tecnico/disponibles')}
      />
    </div>
  )
}

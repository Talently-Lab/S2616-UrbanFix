import { useState } from 'react'
import PagePlaceholder from '../../components/layout/PagePlaceholder'
import { Button, EmptyState, ErrorAlert, FilterChips, Modal, Spinner, Textarea } from '../../components/ui'
import ListaSolicitudes from '../../components/solicitudes/ListaSolicitudes'
import { useAuth } from '../../hooks/useAuth'
import { useSolicitudes } from '../../hooks/useSolicitudes'
import { useToast } from '../../hooks/useToast'
import { opcionesCategorias } from '../../constants/categorias'
import { DESCRIPCIONES_VACIOS, MENSAJES_VACIOS } from '../../constants/mensajesVacios'
import { aceptar, rechazar } from '../../services/solicitudes'

export { default as TecnicoDashboard } from './Dashboard'

const FILTROS_CATEGORIA = [{ value: '', label: 'Todos' }, ...opcionesCategorias()]

const FILTROS_TRABAJO = [
  { value: '', label: 'Todos' },
  { value: 'proceso', label: 'En proceso' },
  { value: 'fin', label: 'Finalizadas' },
]

function enGrupo(estado, grupo) {
  if (grupo === 'proceso') return estado === 'ACEPTADA' || estado === 'EN_PROCESO'
  if (grupo === 'fin') return ['FINALIZADA', 'RECHAZADA', 'CANCELADA'].includes(estado)
  return true
}

export function TecnicoDisponibles() {
  const { solicitudes, status, error, recargar } = useSolicitudes({ limit: 100 })
  const { show } = useToast()
  const [categoria, setCategoria] = useState('')
  const [ocupadoId, setOcupadoId] = useState(null)
  const [rechazando, setRechazando] = useState(null)
  const [motivo, setMotivo] = useState('')
  const [errorMotivo, setErrorMotivo] = useState(null)
  const [errorRechazo, setErrorRechazo] = useState(null)
  const [enviandoRechazo, setEnviandoRechazo] = useState(false)

  const disponibles = solicitudes.filter((s) => s.estado === 'PENDIENTE')
  const filtradas = categoria
    ? disponibles.filter((s) => s.categoria === categoria)
    : disponibles

  async function manejarAceptacion(id) {
    setOcupadoId(id)
    try {
      await aceptar(id)
      show('Aceptaste el trabajo', 'success')
      recargar()
    } catch (err) {
      show(err.message, 'error')
      recargar()
    } finally {
      setOcupadoId(null)
    }
  }

  function abrirRechazo(solicitud) {
    setRechazando(solicitud)
    setMotivo('')
    setErrorMotivo(null)
    setErrorRechazo(null)
  }

  async function manejarRechazo() {
    if (!motivo.trim()) {
      setErrorMotivo('Contá el motivo del rechazo.')
      return
    }
    setEnviandoRechazo(true)
    setErrorRechazo(null)
    try {
      await rechazar(rechazando.id, motivo)
      show('Solicitud rechazada', 'success')
      setRechazando(null)
      recargar()
    } catch (err) {
      setErrorRechazo(err.message)
    } finally {
      setEnviandoRechazo(false)
    }
  }

  if (status === 'loading') {
    return (
      <div className="flex justify-center py-16">
        <Spinner size="lg" />
      </div>
    )
  }

  if (status === 'error') {
    return <ErrorAlert message={error} onRetry={recargar} />
  }

  const acciones = (solicitud) => (
    <>
      <Button
        variant="primary"
        className="flex-1"
        loading={ocupadoId === solicitud.id}
        disabled={ocupadoId !== null && ocupadoId !== solicitud.id}
        onClick={() => manejarAceptacion(solicitud.id)}
      >
        Aceptar
      </Button>
      <Button
        variant="primary-outline"
        className="flex-1"
        disabled={ocupadoId !== null}
        onClick={() => abrirRechazo(solicitud)}
      >
        Rechazar
      </Button>
    </>
  )

  const modal = (
    <Modal
      open={Boolean(rechazando)}
      onClose={() => setRechazando(null)}
      title="Rechazar solicitud"
      footer={
        <>
          <Button variant="secondary" onClick={() => setRechazando(null)} disabled={enviandoRechazo}>
            Cancelar
          </Button>
          <Button variant="danger" loading={enviandoRechazo} onClick={manejarRechazo}>
            Rechazar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {errorRechazo ? <ErrorAlert message={errorRechazo} /> : null}
        <Textarea
          label="Motivo"
          aria-required="true"
          rows={3}
          value={motivo}
          onChange={(event) => {
            setMotivo(event.target.value)
            setErrorMotivo(null)
          }}
          placeholder="Contá por qué no podés tomar este trabajo."
          error={errorMotivo}
        />
      </div>
    </Modal>
  )

  if (disponibles.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-3xl font-bold text-text">Trabajos disponibles</h1>
        <EmptyState
          icon="🛠️"
          title={MENSAJES_VACIOS.tecnicoDisponibles}
          description={DESCRIPCIONES_VACIOS.tecnicoDisponibles}
        />
        {modal}
      </div>
    )
  }

  if (filtradas.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-3xl font-bold text-text">Trabajos disponibles</h1>
        <EmptyState
          icon="🛠️"
          title={MENSAJES_VACIOS.adminSolicitudes}
          description={DESCRIPCIONES_VACIOS.filtrados}
          action={
            <Button variant="secondary" onClick={() => setCategoria('')}>
              Limpiar filtros
            </Button>
          }
        />
        {modal}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-bold text-text">Trabajos disponibles</h1>

      <FilterChips
        label="Filtrar por categoría"
        options={FILTROS_CATEGORIA}
        value={categoria}
        onChange={setCategoria}
      />

      <ListaSolicitudes solicitudes={filtradas} momento="relativo" acciones={acciones} />

      {modal}
    </div>
  )
}

export function TecnicoTrabajos() {
  const { user } = useAuth()
  const { solicitudes, status, error, recargar } = useSolicitudes({ limit: 100 })
  const [grupo, setGrupo] = useState('')

  const mias = solicitudes.filter(
    (s) => s.estado !== 'PENDIENTE' || s.tecnicoEmail === user?.email,
  )
  const filtradas = mias.filter((s) => enGrupo(s.estado, grupo))

  if (status === 'loading') {
    return (
      <div className="flex justify-center py-16">
        <Spinner size="lg" />
      </div>
    )
  }

  if (status === 'error') {
    return <ErrorAlert message={error} onRetry={recargar} />
  }

  if (mias.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-3xl font-bold text-text">Mis trabajos</h1>
        <EmptyState
          icon="🛠️"
          title={MENSAJES_VACIOS.tecnicoTrabajos}
          description={DESCRIPCIONES_VACIOS.tecnicoTrabajos}
        />
      </div>
    )
  }

  if (filtradas.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-3xl font-bold text-text">Mis trabajos</h1>
        <EmptyState
          icon="🛠️"
          title={MENSAJES_VACIOS.adminSolicitudes}
          description={DESCRIPCIONES_VACIOS.filtrados}
          action={
            <Button variant="secondary" onClick={() => setGrupo('')}>
              Limpiar filtros
            </Button>
          }
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-bold text-text">Mis trabajos</h1>

      <FilterChips
        label="Filtrar por estado"
        options={FILTROS_TRABAJO}
        value={grupo}
        onChange={setGrupo}
      />

      <ListaSolicitudes solicitudes={filtradas} momento="relativo" />
    </div>
  )
}

export function TecnicoDetalleTrabajo() {
  return (
    <PagePlaceholder
      title="Detalle del trabajo"
      description="Información de la solicitud asignada y acciones del técnico."
    />
  )
}

export function TecnicoPerfil() {
  return (
    <PagePlaceholder
      title="Mi perfil"
      description="Datos del técnico: oficio, zona de cobertura y disponibilidad."
    />
  )
}

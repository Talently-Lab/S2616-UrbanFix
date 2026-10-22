import { useState } from 'react'
import PagePlaceholder from '../../components/layout/PagePlaceholder'
import { Button, ButtonLink, EmptyState, ErrorAlert, FilterChips, Spinner } from '../../components/ui'
import ListaSolicitudes from '../../components/solicitudes/ListaSolicitudes'
import ModalRechazo from '../../components/solicitudes/ModalRechazo'
import { useAuth } from '../../hooks/useAuth'
import { useSolicitudes } from '../../hooks/useSolicitudes'
import { useToast } from '../../hooks/useToast'
import { opcionesCategorias } from '../../constants/categorias'
import { DESCRIPCIONES_VACIOS, MENSAJES_VACIOS } from '../../constants/mensajesVacios'
import { aceptar } from '../../services/solicitudes'

export { default as TecnicoDashboard } from './Dashboard'
export { default as TecnicoDetalleDisponible } from './DetalleDisponible'
export { default as TecnicoDetalleTrabajo } from './DetalleTrabajo'

const FILTROS_CATEGORIA = [{ value: '', label: 'Todos' }, ...opcionesCategorias()]

const FILTROS_TRABAJO = [
  { value: '', label: 'Todos' },
  { value: 'aceptados', label: 'Aceptados' },
  { value: 'proceso', label: 'En proceso' },
  { value: 'fin', label: 'Finalizados' },
]

function enGrupo(estado, grupo) {
  if (grupo === 'aceptados') return estado === 'ACEPTADA'
  if (grupo === 'proceso') return estado === 'EN_PROCESO'
  if (grupo === 'fin') return estado === 'FINALIZADA'
  return true
}

export function TecnicoDisponibles() {
  const { solicitudes, status, error, recargar } = useSolicitudes({ limit: 100 })
  const { show } = useToast()
  const [categoria, setCategoria] = useState('')
  const [ocupadoId, setOcupadoId] = useState(null)
  const [rechazando, setRechazando] = useState(null)

  const disponibles = solicitudes.filter((s) => s.estado === 'PENDIENTE')
  const filtradas = categoria
    ? disponibles.filter((s) => s.categoria === categoria)
    : disponibles

  async function manejarAceptacion(id) {
    setOcupadoId(id)
    try {
      await aceptar(id)
      show('Trabajo aceptado. Lo ves en «Mis trabajos».', 'success')
      recargar()
    } catch (err) {
      show(err.message, 'error')
      recargar()
    } finally {
      setOcupadoId(null)
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
        onClick={() => setRechazando(solicitud)}
      >
        Rechazar
      </Button>
    </>
  )

  const modal = (
    <ModalRechazo
      solicitud={rechazando}
      onClose={() => setRechazando(null)}
      onRechazado={() => {
        setRechazando(null)
        recargar()
      }}
    />
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

      <ListaSolicitudes
        solicitudes={filtradas}
        momento="relativo"
        detalle="/tecnico/disponibles"
        acciones={acciones}
      />

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
          action={
            <ButtonLink to="/tecnico/disponibles" className="w-full">
              Ver trabajos disponibles
            </ButtonLink>
          }
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

      <ListaSolicitudes
        solicitudes={filtradas}
        momento="miTrabajo"
        detalle="/tecnico/trabajos"
      />
    </div>
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

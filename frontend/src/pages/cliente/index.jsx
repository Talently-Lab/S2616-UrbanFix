import { useState } from 'react'
import PagePlaceholder from '../../components/layout/PagePlaceholder'
import { Button, ButtonLink, EmptyState, ErrorAlert, FilterChips, Spinner } from '../../components/ui'
import ListaSolicitudes from '../../components/solicitudes/ListaSolicitudes'
import { useSolicitudes } from '../../hooks/useSolicitudes'
import { DESCRIPCIONES_VACIOS, MENSAJES_VACIOS } from '../../constants/mensajesVacios'

export { default as ClienteDashboard } from './Dashboard'
export { default as ClienteNuevaSolicitud } from './CrearSolicitud'
export { default as ClienteDetalleSolicitud } from './DetalleSolicitud'

const FILTROS_ESTADO = [
  { value: '', label: 'Todas' },
  { value: 'PENDIENTE', label: 'Pendientes' },
  { value: 'EN_PROCESO', label: 'En proceso' },
  { value: 'FINALIZADA', label: 'Finalizadas' },
]

export function ClienteSolicitudes() {
  const { solicitudes, status, error, recargar, meta } = useSolicitudes({ limit: 100 })
  const [filtro, setFiltro] = useState('')

  const total = meta?.total ?? 0
  const filtradas = filtro ? solicitudes.filter((s) => s.estado === filtro) : solicitudes

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

  if (total === 0) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-3xl font-bold text-text">Mis solicitudes</h1>
        <EmptyState
          icon="🛠️"
          title={MENSAJES_VACIOS.clienteSolicitudes}
          description={DESCRIPCIONES_VACIOS.clienteSolicitudes}
          action={
            <ButtonLink to="/cliente/solicitudes/nueva" className="w-full">
              Nueva solicitud
            </ButtonLink>
          }
        />
      </div>
    )
  }

  if (filtradas.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-3xl font-bold text-text">Mis solicitudes</h1>
        <EmptyState
          icon="🛠️"
          title={MENSAJES_VACIOS.adminSolicitudes}
          description={DESCRIPCIONES_VACIOS.filtrados}
          action={
            <Button variant="secondary" onClick={() => setFiltro('')}>
              Limpiar filtros
            </Button>
          }
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-bold text-text">Mis solicitudes</h1>

      <FilterChips
        label="Filtrar por estado"
        options={FILTROS_ESTADO}
        value={filtro}
        onChange={setFiltro}
      />

      <ListaSolicitudes solicitudes={filtradas} detalle="/cliente/solicitudes" />

      <ButtonLink to="/cliente/solicitudes/nueva" className="w-full">
        Nueva solicitud
      </ButtonLink>
    </div>
  )
}

export function ClientePerfil() {
  return <PagePlaceholder title="Mi perfil" description="Datos personales del cliente." />
}

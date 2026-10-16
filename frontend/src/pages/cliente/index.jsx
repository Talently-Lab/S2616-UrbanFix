import PagePlaceholder from '../../components/layout/PagePlaceholder'
import EmptyState from '../../components/ui/EmptyState'
import ErrorAlert from '../../components/ui/ErrorAlert'
import ButtonLink from '../../components/ui/ButtonLink'
import Spinner from '../../components/ui/Spinner'
import ListaSolicitudes from '../../components/solicitudes/ListaSolicitudes'
import { useSolicitudes } from '../../hooks/useSolicitudes'
import { MENSAJES_VACIOS } from '../../constants/mensajesVacios'

export { default as ClienteDashboard } from './Dashboard'
export { default as ClienteNuevaSolicitud } from './CrearSolicitud'

export function ClienteSolicitudes() {
  const { solicitudes, status, error, recargar } = useSolicitudes()

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text">Mis solicitudes</h1>
          <p className="mt-1 text-text-muted">Todas tus solicitudes de servicio, de más reciente a más antigua.</p>
        </div>
        <ButtonLink to="/cliente/solicitudes/nueva">Nueva solicitud</ButtonLink>
      </header>

      {status === 'loading' ? (
        <div className="flex justify-center py-10">
          <Spinner size="lg" />
        </div>
      ) : status === 'error' ? (
        <ErrorAlert message={error} onRetry={recargar} />
      ) : solicitudes.length === 0 ? (
        <EmptyState
          title={MENSAJES_VACIOS.clienteSolicitudes}
          action={
            <ButtonLink to="/cliente/solicitudes/nueva" variant="primary">
              Nueva solicitud
            </ButtonLink>
          }
        />
      ) : (
        <ListaSolicitudes solicitudes={solicitudes} detalle="/cliente/solicitudes" />
      )}
    </div>
  )
}

export function ClienteDetalleSolicitud() {
  return (
    <PagePlaceholder
      title="Detalle de solicitud"
      description="Estado, técnico asignado y acciones sobre la solicitud."
    />
  )
}

export function ClientePerfil() {
  return <PagePlaceholder title="Mi perfil" description="Datos personales del cliente." />
}

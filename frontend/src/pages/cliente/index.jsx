import PagePlaceholder from '../../components/layout/PagePlaceholder'
import EmptyState from '../../components/ui/EmptyState'
import ButtonLink from '../../components/ui/ButtonLink'
import { useAuth } from '../../hooks/useAuth'
import { MENSAJES_VACIOS } from '../../constants/mensajesVacios'

export function ClienteDashboard() {
  const { user } = useAuth()

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-2xl font-bold text-text">Hola, {user?.name} 👋</h1>
        <p className="mt-1 text-text-muted">¿En qué necesitás ayuda hoy?</p>
      </header>

      <EmptyState
        title={MENSAJES_VACIOS.clienteSolicitudes}
        action={
          <ButtonLink to="/cliente/solicitudes/nueva" variant="primary">
            Nueva solicitud
          </ButtonLink>
        }
      />
    </div>
  )
}

export function ClienteSolicitudes() {
  return (
    <PagePlaceholder
      title="Mis solicitudes"
      description="Listado de solicitudes de servicio del cliente."
    />
  )
}

export function ClienteNuevaSolicitud() {
  return (
    <PagePlaceholder
      title="Nueva solicitud"
      description="Formulario para crear una solicitud de servicio."
    />
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

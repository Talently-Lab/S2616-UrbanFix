import PagePlaceholder from '../../components/layout/PagePlaceholder'
import EmptyState from '../../components/ui/EmptyState'
import ButtonLink from '../../components/ui/ButtonLink'
import { useAuth } from '../../hooks/useAuth'
import { MENSAJES_VACIOS } from '../../constants/mensajesVacios'

export function TecnicoDashboard() {
  const { user } = useAuth()

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-2xl font-bold text-text">Hola, {user?.name} 👋</h1>
        <p className="mt-1 text-text-muted">Estos son tus trabajos de hoy.</p>
      </header>

      <EmptyState
        title={MENSAJES_VACIOS.tecnicoTrabajos}
        action={
          <ButtonLink to="/tecnico/disponibles" variant="primary">
            Ir a trabajos disponibles
          </ButtonLink>
        }
      />
    </div>
  )
}

export function TecnicoDisponibles() {
  return (
    <PagePlaceholder
      title="Trabajos disponibles"
      description="Solicitudes abiertas que el técnico puede aceptar o rechazar."
    />
  )
}

export function TecnicoTrabajos() {
  return <PagePlaceholder title="Mis trabajos" description="Historial y estado de los trabajos aceptados." />
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

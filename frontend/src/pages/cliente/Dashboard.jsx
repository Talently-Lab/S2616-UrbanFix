import ButtonLink from '../../components/ui/ButtonLink'
import EmptyState from '../../components/ui/EmptyState'
import ErrorAlert from '../../components/ui/ErrorAlert'
import Spinner from '../../components/ui/Spinner'
import ListaSolicitudes from '../../components/solicitudes/ListaSolicitudes'
import { useAuth } from '../../hooks/useAuth'
import { useSolicitudes } from '../../hooks/useSolicitudes'
import { MENSAJES_VACIOS } from '../../constants/mensajesVacios'

const ULTIMAS = { limit: 3 }

export default function ClienteDashboard() {
  const { user } = useAuth()
  const { solicitudes, status, error, recargar } = useSolicitudes(ULTIMAS)

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text">Hola, {user?.name} 👋</h1>
          <p className="mt-1 text-text-muted">¿En qué necesitás ayuda hoy?</p>
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
          description="Contanos qué necesitás y un técnico se pone en contacto."
          action={
            <ButtonLink to="/cliente/solicitudes/nueva" variant="primary">
              Nueva solicitud
            </ButtonLink>
          }
        />
      ) : (
        <section className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-text">Tus solicitudes</h2>
            <ButtonLink to="/cliente/solicitudes" variant="ghost">
              Ver todas
            </ButtonLink>
          </div>
          <ListaSolicitudes solicitudes={solicitudes} detalle="/cliente/solicitudes" />
        </section>
      )}
    </div>
  )
}

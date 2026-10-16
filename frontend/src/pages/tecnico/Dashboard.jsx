import ButtonLink from '../../components/ui/ButtonLink'
import EmptyState from '../../components/ui/EmptyState'
import ErrorAlert from '../../components/ui/ErrorAlert'
import Spinner from '../../components/ui/Spinner'
import ListaSolicitudes from '../../components/solicitudes/ListaSolicitudes'
import { useAuth } from '../../hooks/useAuth'
import { useSolicitudes } from '../../hooks/useSolicitudes'
import { MENSAJES_VACIOS } from '../../constants/mensajesVacios'

function esMio(solicitud, user) {
  if (solicitud.tecnicoId != null && solicitud.tecnicoId === user?.id) return true
  return Boolean(solicitud.tecnicoEmail) && solicitud.tecnicoEmail === user?.email
}

export default function TecnicoDashboard() {
  const { user } = useAuth()
  const { solicitudes, status, error, recargar } = useSolicitudes()

  const disponibles = solicitudes.filter((s) => s.estado === 'PENDIENTE')
  const mios = solicitudes.filter((s) => esMio(s, user))
  const sinNada = disponibles.length === 0 && mios.length === 0

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-2xl font-bold text-text">Hola, {user?.name} 👋</h1>
        <p className="mt-1 text-text-muted">Estos son tus trabajos de hoy.</p>
      </header>

      {status === 'loading' ? (
        <div className="flex justify-center py-10">
          <Spinner size="lg" />
        </div>
      ) : status === 'error' ? (
        <ErrorAlert message={error} onRetry={recargar} />
      ) : sinNada ? (
        <EmptyState
          title={MENSAJES_VACIOS.tecnicoTrabajos}
          description="Cuando haya solicitudes disponibles las vas a ver acá."
          action={
            <ButtonLink to="/tecnico/disponibles" variant="primary">
              Ir a trabajos disponibles
            </ButtonLink>
          }
        />
      ) : (
        <>
          {mios.length > 0 ? (
            <section className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-text">Mis trabajos</h2>
                <ButtonLink to="/tecnico/trabajos" variant="ghost">
                  Ver todos
                </ButtonLink>
              </div>
              <ListaSolicitudes
                solicitudes={mios.slice(0, 3)}
                detalle="/tecnico/trabajos"
              />
            </section>
          ) : null}

          <section className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-text">Disponibles ahora</h2>
              <ButtonLink to="/tecnico/disponibles" variant="ghost">
                Ver todas
              </ButtonLink>
            </div>
            {disponibles.length === 0 ? (
              <EmptyState title={MENSAJES_VACIOS.tecnicoDisponibles} />
            ) : (
              <ListaSolicitudes
                solicitudes={disponibles.slice(0, 3)}
                detalle="/tecnico/disponibles"
              />
            )}
          </section>
        </>
      )}
    </div>
  )
}

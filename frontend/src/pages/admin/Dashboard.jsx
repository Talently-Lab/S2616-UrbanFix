import EmptyState from '../../components/ui/EmptyState'
import ErrorAlert from '../../components/ui/ErrorAlert'
import ResumenCard from '../../components/ui/ResumenCard'
import Spinner from '../../components/ui/Spinner'
import { useAuth } from '../../hooks/useAuth'
import { useSolicitudes } from '../../hooks/useSolicitudes'

const PARAMS = { limit: 100 }

export default function AdminDashboard() {
  const { user } = useAuth()
  const { solicitudes, meta, status, error, recargar } = useSolicitudes(PARAMS)

  const total = meta?.total ?? solicitudes.length
  const contar = (estado) => solicitudes.filter((s) => s.estado === estado).length

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-2xl font-bold text-text">Hola, {user?.name} 👋</h1>
        <p className="mt-1 text-text-muted">Indicadores generales de la plataforma.</p>
      </header>

      {status === 'loading' ? (
        <div className="flex justify-center py-10">
          <Spinner size="lg" />
        </div>
      ) : status === 'error' ? (
        <ErrorAlert message={error} onRetry={recargar} />
      ) : total === 0 ? (
        <EmptyState
          title="Todavía no hay indicadores para mostrar."
          description="Cuando haya solicitudes y usuarios en la plataforma, los KPIs van a aparecer acá."
        />
      ) : (
        <section className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold text-text">Solicitudes</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <ResumenCard valor={total} titulo="Total" />
            <ResumenCard valor={contar('PENDIENTE')} titulo="Pendientes" />
            <ResumenCard valor={contar('EN_PROCESO')} titulo="En proceso" />
            <ResumenCard valor={contar('FINALIZADA')} titulo="Finalizadas" />
          </div>
        </section>
      )}
    </div>
  )
}

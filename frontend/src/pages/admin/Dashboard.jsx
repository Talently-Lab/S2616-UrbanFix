import { useState } from 'react'
import { ErrorAlert, ResumenCard, Spinner, Tabs } from '../../components/ui'
import TablaSolicitudes from '../../components/admin/TablaSolicitudes'
import TablaUsuarios from '../../components/admin/TablaUsuarios'
import { useAuth } from '../../hooks/useAuth'
import { useSolicitudes } from '../../hooks/useSolicitudes'

const PARAMS = { limit: 100 }

const TABS = [
  { value: 'solicitudes', label: 'Solicitudes' },
  { value: 'usuarios', label: 'Usuarios' },
]

// Centro de control del admin (Semana 6): KPIs + pestañas que alternan entre
// la tabla de solicitudes (con filtros y moderación) y la tabla de usuarios.
export default function AdminDashboard() {
  const { user } = useAuth()
  const { solicitudes, meta, status, error, recargar } = useSolicitudes(PARAMS)
  const [tab, setTab] = useState('solicitudes')

  const total = meta?.total ?? solicitudes.length
  const contar = (estado) => solicitudes.filter((s) => s.estado === estado).length

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-2xl font-bold text-text">
          <span className="whitespace-nowrap">
            Hola{user?.name?.trim() ? `, ${user.name.trim()}` : ''} 👋
          </span>
        </h1>
        <p className="mt-1 text-text-muted">Indicadores generales de la plataforma.</p>
      </header>

      {status === 'ready' && total > 0 ? (
        <section aria-label="Resumen" className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold text-text">Resumen</h2>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            <ResumenCard valor={total} titulo="Total" />
            <ResumenCard valor={contar('PENDIENTE')} titulo="Pendientes" />
            <ResumenCard valor={contar('EN_PROCESO')} titulo="En proceso" />
            <ResumenCard valor={contar('FINALIZADA')} titulo="Finalizadas" />
          </div>
        </section>
      ) : null}

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold text-text">Centro de control</h2>

        <Tabs tabs={TABS} value={tab} onChange={setTab} label="Tablas del panel" />

        <div
          role="tabpanel"
          id={`panel-${tab}`}
          aria-labelledby={`tab-${tab}`}
          tabIndex={-1}
          className="flex flex-col gap-4"
        >
          {tab === 'usuarios' ? (
            <TablaUsuarios />
          ) : status === 'loading' ? (
            <div className="flex justify-center py-16">
              <Spinner size="lg" />
            </div>
          ) : status === 'error' ? (
            <ErrorAlert message={error} onRetry={recargar} />
          ) : (
            <TablaSolicitudes
              solicitudes={solicitudes}
              status="ready"
              recargar={recargar}
            />
          )}
        </div>
      </section>
    </div>
  )
}

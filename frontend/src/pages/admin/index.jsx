import PagePlaceholder from '../../components/layout/PagePlaceholder'
import EmptyState from '../../components/ui/EmptyState'
import { useAuth } from '../../hooks/useAuth'

export function AdminDashboard() {
  const { user } = useAuth()

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-2xl font-bold text-text">Hola, {user?.name} 👋</h1>
        <p className="mt-1 text-text-muted">Indicadores generales de la plataforma.</p>
      </header>

      <EmptyState
        title="Todavía no hay indicadores para mostrar."
        description="Cuando haya solicitudes y usuarios en la plataforma, los KPIs van a aparecer acá."
      />
    </div>
  )
}

export function AdminUsuarios() {
  return (
    <PagePlaceholder
      title="Gestión de usuarios"
      description="Alta, baja y cambio de rol de clientes y técnicos."
    />
  )
}

export function AdminSolicitudes() {
  return (
    <PagePlaceholder
      title="Gestión de solicitudes"
      description="Administración de todas las solicitudes de servicio."
    />
  )
}

export function AdminReportes() {
  return <PagePlaceholder title="Reportes" description="Reportes operativos de la plataforma." />
}

export function AdminConfiguracion() {
  return <PagePlaceholder title="Configuración" description="Ajustes generales de la plataforma." />
}

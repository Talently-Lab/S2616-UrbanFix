import PagePlaceholder from '../../components/layout/PagePlaceholder'

export function AdminDashboard() {
  return (
    <PagePlaceholder
      title="Panel de administración"
      description="Indicadores generales de la plataforma."
    />
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

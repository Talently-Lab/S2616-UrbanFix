import PagePlaceholder from '../../components/layout/PagePlaceholder'

export { default as AdminDashboard } from './Dashboard'
export { default as AdminSolicitudes } from './Solicitudes'
export { default as AdminDetalleSolicitud } from './DetalleSolicitud'

export function AdminUsuarios() {
  return (
    <PagePlaceholder
      title="Gestión de usuarios"
      description="Alta, baja y cambio de rol de clientes y técnicos."
    />
  )
}

export function AdminReportes() {
  return <PagePlaceholder title="Reportes" description="Reportes operativos de la plataforma." />
}

export function AdminConfiguracion() {
  return <PagePlaceholder title="Configuración" description="Ajustes generales de la plataforma." />
}

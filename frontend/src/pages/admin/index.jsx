import PagePlaceholder from '../../components/layout/PagePlaceholder'

export { default as AdminDashboard } from './Dashboard'
export { default as AdminSolicitudes } from './Solicitudes'
export { default as AdminUsuarios } from './Usuarios'
export { default as AdminDetalleSolicitud } from './DetalleSolicitud'

export function AdminReportes() {
  return <PagePlaceholder title="Reportes" description="Reportes operativos de la plataforma." />
}

export function AdminConfiguracion() {
  return <PagePlaceholder title="Configuración" description="Ajustes generales de la plataforma." />
}

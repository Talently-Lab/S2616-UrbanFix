import PagePlaceholder from '../../components/layout/PagePlaceholder'

export function ClienteDashboard() {
  return (
    <PagePlaceholder
      title="Panel del cliente"
      description="Resumen de solicitudes de servicio creadas y su estado."
    />
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

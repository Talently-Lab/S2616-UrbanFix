import PagePlaceholder from '../../components/layout/PagePlaceholder'

export function TecnicoDashboard() {
  return (
    <PagePlaceholder
      title="Panel del técnico"
      description="Trabajos asignados, pendientes y métricas básicas."
    />
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

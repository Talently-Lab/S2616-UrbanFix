// Estados de solicitud — enum del backend (backend/docs/API_CONTRACT.md §2)
// y etiquetas del sistema de diseño base (§1 · Estados de una solicitud).

export const ESTADOS_SOLICITUD = {
  PENDIENTE: 'Pendiente',
  ACEPTADA: 'Aceptada',
  EN_PROCESO: 'En proceso',
  FINALIZADA: 'Finalizada',
  RECHAZADA: 'Rechazada',
  CANCELADA: 'Cancelada',
}

export const ESTADOS_SOLICITUD_LISTA = Object.keys(ESTADOS_SOLICITUD)

export function opcionesEstados() {
  return ESTADOS_SOLICITUD_LISTA.map((codigo) => ({
    value: codigo,
    label: ESTADOS_SOLICITUD[codigo],
  }))
}

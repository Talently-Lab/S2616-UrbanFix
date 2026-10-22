// D1 — EstadoSolicitudBadge (inventario de UX/UI, §2)
// Etiqueta con ícono + texto; los 6 estados con los pares texto/fondo
// del sistema de diseño base (§1 · Estados de una solicitud).
// Regla: el estado nunca se comunica solo con color.

import { ESTADOS_SOLICITUD } from '../../constants/estadosSolicitud'

function Icono({ children }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

const IconoReloj = () => (
  <Icono>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </Icono>
)

const IconoCheck = () => (
  <Icono>
    <path d="M20 6 9 17l-5-5" />
  </Icono>
)

const IconoLlave = () => (
  <Icono>
    <path d="M14.7 6.3a4 4 0 0 0 5 5l-9.4 9.4a2.1 2.1 0 0 1-3-3l9.4-9.4z" />
    <path d="M14.7 6.3 17.5 3.5" />
  </Icono>
)

const IconoCheckDoble = () => (
  <Icono>
    <path d="M1.5 12.5 6 17l6-10" />
    <path d="M8 15.5 10 19l9-13" />
  </Icono>
)

const IconoCruz = () => (
  <Icono>
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </Icono>
)

const IconoProhibido = () => (
  <Icono>
    <circle cx="12" cy="12" r="9" />
    <path d="m5.6 5.6 12.8 12.8" />
  </Icono>
)

const ESTADOS = {
  PENDIENTE: { className: 'bg-[#FEF3C7] text-[#92400E]', Icono: IconoReloj },
  ACEPTADA: { className: 'bg-[#DBEAFE] text-[#1E40AF]', Icono: IconoCheck },
  EN_PROCESO: { className: 'bg-[#EDE9FE] text-[#5B21B6]', Icono: IconoLlave },
  FINALIZADA: { className: 'bg-[#DCFCE7] text-[#166534]', Icono: IconoCheckDoble },
  RECHAZADA: { className: 'bg-error-soft text-error-hover', Icono: IconoCruz },
  CANCELADA: { className: 'bg-[#F3F4F6] text-[#374151]', Icono: IconoProhibido },
}

export default function EstadoSolicitudBadge({ estado, className = '' }) {
  const config = ESTADOS[estado]
  if (!config) return null

  const { Icono: IconoEstado } = config

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${config.className} ${className}`}
    >
      <IconoEstado />
      {ESTADOS_SOLICITUD[estado] ?? estado}
    </span>
  )
}

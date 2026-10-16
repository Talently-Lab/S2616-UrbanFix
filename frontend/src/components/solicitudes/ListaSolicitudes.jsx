import SolicitudCard from './SolicitudCard'

// Listado vertical de SolicitudCard. `detalle` es el prefijo de la ruta de
// detalle (por ejemplo /cliente/solicitudes); sin prefijo las cards no son links.
export default function ListaSolicitudes({ solicitudes, detalle, className = '' }) {
  return (
    <ul className={`flex flex-col gap-3 ${className}`}>
      {solicitudes.map((solicitud) => (
        <li key={solicitud.id}>
          <SolicitudCard
            solicitud={solicitud}
            to={detalle ? `${detalle}/${solicitud.id}` : undefined}
          />
        </li>
      ))}
    </ul>
  )
}

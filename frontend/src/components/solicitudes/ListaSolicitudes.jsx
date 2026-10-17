import SolicitudCard from './SolicitudCard'

export default function ListaSolicitudes({
  solicitudes,
  detalle,
  momento = 'fecha',
  acciones,
  className = '',
}) {
  return (
    <ul className={`flex flex-col gap-4 ${className}`}>
      {solicitudes.map((solicitud) => (
        <li key={solicitud.id}>
          <SolicitudCard
            solicitud={solicitud}
            to={detalle ? `${detalle}/${solicitud.id}` : undefined}
            momento={momento}
            acciones={acciones ? acciones(solicitud) : null}
          />
        </li>
      ))}
    </ul>
  )
}

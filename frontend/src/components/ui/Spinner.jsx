const SIZES = {
  sm: 'size-4 border-2',
  md: 'size-6 border-2',
  lg: 'size-10 border-4',
}

// tone invertido: para spinner sobre fondos con color (botón primario/peligro),
// donde el gris por defecto no tiene contraste.
const TONES = {
  default: 'border-border border-t-primary',
  invert: 'border-white/40 border-t-white',
}

export default function Spinner({ size = 'md', tone = 'default', className = '' }) {
  return (
    <span
      role="status"
      aria-label="Cargando"
      className={`inline-block animate-spin rounded-full ${TONES[tone]} ${SIZES[size]} ${className}`}
    />
  )
}

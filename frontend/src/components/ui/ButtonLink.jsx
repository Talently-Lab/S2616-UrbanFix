import { Link } from 'react-router-dom'
import { BUTTON_BASE, BUTTON_FOCUS, VARIANTS } from './buttonStyles'

// Link con aspecto de Button. No se usa <Button> dentro de <Link>
// (genera botón anidado en botón: HTML inválido).
export default function ButtonLink({
  to,
  variant = 'primary',
  className = '',
  children,
  ...props
}) {
  return (
    <Link
      to={to}
      className={`${BUTTON_BASE} ${BUTTON_FOCUS} ${VARIANTS[variant]} ${className}`}
      {...props}
    >
      {children}
    </Link>
  )
}

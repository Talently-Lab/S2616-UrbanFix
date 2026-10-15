import Spinner from './Spinner'
import { BUTTON_BASE, BUTTON_FOCUS, VARIANTS } from './buttonStyles'

export default function Button({
  variant = 'primary',
  type = 'button',
  loading = false,
  disabled = false,
  className = '',
  children,
  ...props
}) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={`${BUTTON_BASE} ${BUTTON_FOCUS} ${VARIANTS[variant]} ${className}`}
      {...props}
    >
      {loading ? <Spinner size="sm" /> : null}
      {children}
    </button>
  )
}

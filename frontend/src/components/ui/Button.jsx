import Spinner from './Spinner'
import { BUTTON_BASE, BUTTON_FOCUS, LOADING_VARIANTS, VARIANTS } from './buttonStyles'

const FILLED_VARIANTS = ['primary', 'danger']

export default function Button({
  variant = 'primary',
  type = 'button',
  loading = false,
  disabled = false,
  className = '',
  children,
  ...props
}) {
  const styles = loading && LOADING_VARIANTS[variant] ? LOADING_VARIANTS[variant] : VARIANTS[variant]

  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={`${BUTTON_BASE} ${BUTTON_FOCUS} ${styles} ${className}`}
      {...props}
    >
      {loading ? (
        <Spinner size="sm" tone={FILLED_VARIANTS.includes(variant) ? 'invert' : 'default'} />
      ) : null}
      {children}
    </button>
  )
}

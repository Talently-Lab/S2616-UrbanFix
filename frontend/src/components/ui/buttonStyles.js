// Estilos compartidos entre Button (botón) y ButtonLink (link con aspecto de botón).
// Regla de diseño: un solo primario por pantalla, alto mínimo 44px, foco visible 2px.

export const BUTTON_BASE =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-field px-5 text-sm font-medium transition-colors disabled:cursor-not-allowed'

export const BUTTON_FOCUS =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary'

export const VARIANTS = {
  primary: 'bg-primary text-white hover:bg-primary-hover disabled:bg-primary/40',
  'primary-outline':
    'border border-primary bg-surface text-primary hover:bg-primary/5 disabled:text-primary/40 disabled:border-primary/40',
  secondary:
    'border border-border-input bg-surface text-text hover:bg-bg disabled:text-text-muted/50',
  danger: 'bg-error text-white hover:brightness-90 disabled:bg-error/40',
  ghost: 'text-text-muted hover:bg-border/50 disabled:text-text-muted/50',
}

export const LOADING_VARIANTS = {
  primary: 'bg-primary text-white',
  danger: 'bg-error text-white',
}

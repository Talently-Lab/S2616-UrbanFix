import Button from './Button'

export default function ErrorAlert({ message, onRetry }) {
  return (
    <div
      role="alert"
      className="flex items-center justify-between gap-4 rounded-field border border-error/30 bg-error/10 px-4 py-3 text-sm text-error"
    >
      <span>{message}</span>
      {onRetry ? (
        <Button variant="secondary" onClick={onRetry} className="shrink-0">
          Reintentar
        </Button>
      ) : null}
    </div>
  )
}

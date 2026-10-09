import Button from './Button'

export default function ErrorAlert({ message, onRetry }) {
  return (
    <div
      role="alert"
      className="flex items-center justify-between gap-4 rounded border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
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

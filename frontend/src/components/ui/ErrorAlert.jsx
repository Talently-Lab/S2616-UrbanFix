import Button from './Button'

function WarningIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className="mt-0.5 shrink-0"
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M10.3 3.6a2 2 0 0 1 3.4 0l8.2 14.2a2 2 0 0 1-1.7 3H3.8a2 2 0 0 1-1.7-3L10.3 3.6zM11 8.5h2V14h-2V8.5zm0 7h2v2h-2v-2z"
      />
    </svg>
  )
}

export default function ErrorAlert({ message, onRetry }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-field border border-error/30 bg-error/10 px-3 py-3 text-sm text-error"
    >
      <WarningIcon />
      <span className="flex-1">{message}</span>
      {onRetry ? (
        <Button variant="secondary" onClick={onRetry} className="shrink-0">
          Reintentar
        </Button>
      ) : null}
    </div>
  )
}

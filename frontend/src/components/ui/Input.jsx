import { useId, useState } from 'react'

function EyeIcon({ off = false }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
      {off ? <path d="M3 3l18 18" /> : null}
    </svg>
  )
}

const FIELD =
  'min-h-11 w-full rounded-field border bg-surface px-3 py-2 text-base text-text placeholder:text-text-muted/60 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary disabled:bg-bg disabled:text-text-muted'

export default function Input({ label, hint, error, id, className = '', type = 'text', ...props }) {
  const generatedId = useId()
  const inputId = id ?? generatedId
  const [visible, setVisible] = useState(false)
  const isPassword = type === 'password'
  const inputType = isPassword && visible ? 'text' : type
  const border = error ? 'border-error' : 'border-border-input'

  return (
    <div className="flex flex-col gap-1 text-sm">
      <label htmlFor={inputId} className="font-medium text-text">
        {label}
        {props.required ? <span className="text-error"> *</span> : null}
      </label>

      <div className="relative">
        <input
          id={inputId}
          type={inputType}
          aria-invalid={Boolean(error)}
          className={`${FIELD} ${border} ${isPassword ? 'pr-11' : ''} ${className}`}
          {...props}
        />
        {isPassword ? (
          <button
            type="button"
            onClick={() => setVisible((current) => !current)}
            aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            aria-pressed={visible}
            className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-text-muted hover:text-text"
          >
            <EyeIcon off={visible} />
          </button>
        ) : null}
      </div>

      {error ? (
        <span className="text-xs text-error">{error}</span>
      ) : hint ? (
        <span className="text-xs text-text-muted">{hint}</span>
      ) : null}
    </div>
  )
}

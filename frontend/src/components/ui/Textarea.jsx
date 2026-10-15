import { useId } from 'react'

const FIELD =
  'w-full rounded-field border bg-surface px-3 py-2 text-base text-text placeholder:text-text-muted/60 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary disabled:bg-bg disabled:text-text-muted'

export default function Textarea({ label, error, id, rows = 4, className = '', ...props }) {
  const generatedId = useId()
  const textareaId = id ?? generatedId
  const border = error ? 'border-error' : 'border-border-input'
  const tieneLimite = typeof props.maxLength === 'number' && props.value !== undefined
  const usados = typeof props.value === 'string' ? props.value.length : 0
  const casiLleno = tieneLimite && usados >= props.maxLength * 0.9

  return (
    <div className="flex flex-col gap-1 text-sm">
      <label htmlFor={textareaId} className="font-medium text-text">
        {label}
        {props.required ? <span className="text-error"> *</span> : null}
      </label>

      <textarea
        id={textareaId}
        rows={rows}
        className={`${FIELD} ${border} ${className}`}
        {...props}
      />

      {tieneLimite ? (
        <span className={`text-right text-xs ${casiLleno ? 'text-warning' : 'text-text-muted'}`}>
          {usados} / {props.maxLength}
        </span>
      ) : null}

      {error ? <span className="text-xs text-error">{error}</span> : null}
    </div>
  )
}

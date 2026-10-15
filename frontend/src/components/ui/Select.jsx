import { useId } from 'react'

const FIELD =
  'min-h-11 w-full rounded-field border bg-surface px-3 py-2 text-base text-text focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary disabled:bg-bg disabled:text-text-muted'

export default function Select({ label, error, id, options = [], className = '', ...props }) {
  const generatedId = useId()
  const selectId = id ?? generatedId
  const border = error ? 'border-error' : 'border-border-input'

  return (
    <div className="flex flex-col gap-1 text-sm">
      <label htmlFor={selectId} className="font-medium text-text">
        {label}
        {props.required ? <span className="text-error"> *</span> : null}
      </label>

      <select id={selectId} className={`${FIELD} ${border} ${className}`} {...props}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>

      {error ? <span className="text-xs text-error">{error}</span> : null}
    </div>
  )
}

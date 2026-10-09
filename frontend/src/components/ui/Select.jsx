import { useId } from 'react'

export default function Select({ label, error, id, options = [], className = '', ...props }) {
  const generatedId = useId()
  const selectId = id ?? generatedId

  return (
    <label htmlFor={selectId} className="flex flex-col gap-1 text-sm text-slate-700">
      <span>{label}</span>
      <select
        id={selectId}
        className={`rounded border px-3 py-2 text-slate-900 focus:border-slate-500 focus:outline-none ${
          error ? 'border-rose-500' : 'border-slate-300'
        } ${className}`}
        {...props}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {error ? <span className="text-xs text-rose-600">{error}</span> : null}
    </label>
  )
}

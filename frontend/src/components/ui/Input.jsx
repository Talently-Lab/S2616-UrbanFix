import { useId } from 'react'

export default function Input({ label, error, id, className = '', ...props }) {
  const generatedId = useId()
  const inputId = id ?? generatedId

  return (
    <label htmlFor={inputId} className="flex flex-col gap-1 text-sm text-slate-700">
      <span>
        {label}
        {props.required ? <span className="text-rose-600"> *</span> : null}
      </span>
      <input
        id={inputId}
        className={`rounded border px-3 py-2 text-slate-900 focus:border-slate-500 focus:outline-none ${
          error ? 'border-rose-500' : 'border-slate-300'
        } ${className}`}
        {...props}
      />
      {error ? <span className="text-xs text-rose-600">{error}</span> : null}
    </label>
  )
}

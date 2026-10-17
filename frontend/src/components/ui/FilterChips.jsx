export default function FilterChips({ options, value, onChange, label }) {
  return (
    <div
      role="group"
      aria-label={label}
      className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0"
    >
      {options.map((option) => {
        const activo = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={activo}
            onClick={() => onChange(option.value)}
            className={`min-h-9 shrink-0 rounded-full border px-4 py-1.5 text-sm font-medium transition-colors ${
              activo
                ? 'border-primary bg-primary text-white'
                : 'border-border bg-surface text-text hover:border-border-input'
            }`}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

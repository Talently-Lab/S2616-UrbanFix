export default function SegmentedControl({ label, options, value, onChange }) {
  return (
    <div role="group" aria-label={label} className="flex flex-col gap-1 text-sm">
      <span className="font-medium text-text">{label}</span>
      <div className="grid grid-cols-2 gap-2 sm:gap-3">
        {options.map((option) => {
          const selected = option.value === value
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(option.value)}
              className={`flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-field border px-2 py-2 text-sm font-medium transition-colors sm:px-3 ${
                selected
                  ? 'border-primary bg-primary/5 text-primary'
                  : 'border-border bg-surface text-text hover:border-border-input'
              }`}
            >
              <span
                aria-hidden="true"
                className={`size-2.5 rounded-full ${selected ? 'bg-primary' : 'border border-border-input'}`}
              />
              {option.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

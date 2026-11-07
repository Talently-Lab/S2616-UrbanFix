import { useRef } from 'react'

// Pestañas del centro de control de administración (Semana 6): cambian la
// tabla visible sin salir del dashboard. Semántica de tabs (tablist/tab/
// panel) con navegación por flechas, Home y End; estilo de los FilterChips.
export default function Tabs({ tabs, value, onChange, label }) {
  const refs = useRef([])

  function manejarTecla(event, index) {
    let siguiente = null
    if (event.key === 'ArrowRight') siguiente = (index + 1) % tabs.length
    else if (event.key === 'ArrowLeft') siguiente = (index - 1 + tabs.length) % tabs.length
    else if (event.key === 'Home') siguiente = 0
    else if (event.key === 'End') siguiente = tabs.length - 1
    if (siguiente === null) return

    event.preventDefault()
    onChange(tabs[siguiente].value)
    refs.current[siguiente]?.focus()
  }

  return (
    <div role="tablist" aria-label={label} className="flex gap-2 overflow-x-auto pb-1">
      {tabs.map((tab, index) => {
        const activo = tab.value === value
        return (
          <button
            key={tab.value}
            ref={(elemento) => {
              refs.current[index] = elemento
            }}
            type="button"
            role="tab"
            id={`tab-${tab.value}`}
            aria-controls={`panel-${tab.value}`}
            aria-selected={activo}
            tabIndex={activo ? 0 : -1}
            onClick={() => onChange(tab.value)}
            onKeyDown={(event) => manejarTecla(event, index)}
            className={`min-h-11 shrink-0 rounded-full px-5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
              activo
                ? 'bg-primary text-white'
                : 'border border-border bg-surface text-text hover:border-border-input'
            }`}
          >
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}

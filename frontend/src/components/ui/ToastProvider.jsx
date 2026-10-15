import { useCallback, useMemo, useState } from 'react'
import { ToastContext } from './toast-context'

const TONES = {
  success: 'bg-success text-white',
  error: 'bg-error text-white',
  info: 'bg-info text-white',
}

let nextId = 0

export default function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const dismiss = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const show = useCallback(
    (message, type = 'info') => {
      const id = ++nextId
      setToasts((current) => [...current, { id, message, type }])
      window.setTimeout(() => dismiss(id), 4000)
      return id
    },
    [dismiss],
  )

  const value = useMemo(() => ({ show, dismiss }), [show, dismiss])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role="status"
            className={`flex items-center gap-4 rounded-field px-4 py-3 text-sm shadow-md ${TONES[toast.type] ?? TONES.info}`}
          >
            <span>{toast.message}</span>
            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              aria-label="Cerrar aviso"
              className="opacity-70 hover:opacity-100"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

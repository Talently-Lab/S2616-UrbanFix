import { Link } from 'react-router-dom'
import { ROLES } from '../../constants/roles'
import { useAuth } from '../../hooks/useAuth'

export default function Home() {
  const { isAuthenticated, user, logout } = useAuth()

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center gap-6 px-6 text-center">
      <h1 className="text-4xl font-bold text-slate-900">UrbanFix</h1>
      <p className="text-slate-600">
        Marketplace de oficios que conecta clientes con técnicos independientes.
      </p>

      {isAuthenticated ? (
        <div className="flex flex-col items-center gap-3">
          <p className="text-sm text-slate-500">
            Sesión activa: {user.email} ({user.role})
          </p>
          <div className="flex gap-3">
            <Link className="rounded bg-slate-900 px-4 py-2 text-white" to={`/${user.role}`}>
              Ir a mi panel
            </Link>
            <button
              type="button"
              onClick={logout}
              className="rounded border border-slate-300 px-4 py-2 text-slate-700"
            >
              Cerrar sesión
            </button>
          </div>
        </div>
      ) : (
        <div className="flex gap-3">
          <Link className="rounded bg-slate-900 px-4 py-2 text-white" to="/login">
            Iniciar sesión
          </Link>
          <Link
            className="rounded border border-slate-300 px-4 py-2 text-slate-700"
            to="/registro"
          >
            Crear cuenta
          </Link>
        </div>
      )}

      <p className="text-xs text-slate-400">Perfiles soportados: {Object.values(ROLES).join(', ')}</p>
    </main>
  )
}

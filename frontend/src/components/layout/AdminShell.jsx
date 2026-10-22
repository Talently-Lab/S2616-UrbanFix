import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'

const linkClases = ({ isActive }) =>
  `block rounded-field px-3 py-2 text-sm font-medium transition-colors ${
    isActive ? 'bg-primary/10 text-primary' : 'text-text hover:bg-bg'
  }`

// A2–A4 — Shell del panel de administración: sidebar fijo con marca,
// "Administración" y el pie con el usuario + cerrar sesión (Figma pág. 04).
export default function AdminShell() {
  const { user, logout } = useAuth()
  const nombre = user?.name?.trim() ? user.name.trim().split(' ')[0] : 'Admin'

  return (
    <div className="flex min-h-screen bg-bg">
      <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-surface">
        <div className="px-4 py-5">
          <p className="text-lg font-bold text-primary">UrbanFix</p>
          <p className="text-sm text-text-muted">Administración</p>
        </div>

        <nav className="flex flex-col gap-1 px-2">
          <NavLink to="/admin/solicitudes" className={linkClases}>
            Solicitudes
          </NavLink>
        </nav>

        <div className="mt-auto flex flex-col gap-1 px-4 py-4">
          <p className="text-sm font-semibold text-text">{nombre}</p>
          <button
            type="button"
            onClick={logout}
            className="text-left text-sm text-primary underline-offset-4 hover:underline"
          >
            Cerrar sesión
          </button>
        </div>
      </aside>

      <main className="w-full px-10 py-8">
        <Outlet />
      </main>
    </div>
  )
}

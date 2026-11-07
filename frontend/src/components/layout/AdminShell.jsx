import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'

const linkClases = ({ isActive }) =>
  `block shrink-0 whitespace-nowrap rounded-field px-3 py-2 text-sm font-medium transition-colors ${
    isActive ? 'bg-primary/10 text-primary' : 'text-text hover:bg-bg'
  }`

const LINKS = [
  { to: '/admin', label: 'Panel', fin: true },
  { to: '/admin/solicitudes', label: 'Solicitudes' },
  { to: '/admin/usuarios', label: 'Usuarios' },
]

// A2–A4 — Shell del panel de administración: sidebar fijo con marca,
// navegación y el pie con el usuario + cerrar sesión (Figma pág. 04).
// Responsive (Semana 7): en móvil la barra queda arriba, en horizontal y con
// scroll; en escritorio (lg) pasa al lateral de siempre.
export default function AdminShell() {
  const { user, logout } = useAuth()
  const nombre = user?.name?.trim() ? user.name.trim().split(' ')[0] : 'Admin'

  return (
    <div className="flex min-h-screen flex-col bg-bg lg:flex-row">
      <aside className="flex w-full flex-col border-b border-border bg-surface lg:w-60 lg:shrink-0 lg:border-b-0 lg:border-r">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 lg:flex-col lg:items-start lg:gap-0 lg:px-4 lg:py-5">
          <div>
            <p className="text-lg font-bold text-primary">UrbanFix</p>
            <p className="text-sm text-text-muted">Administración</p>
          </div>

          <div className="flex items-center gap-3 lg:hidden">
            <span className="max-w-40 truncate text-sm font-semibold text-text">{nombre}</span>
            <button
              type="button"
              onClick={logout}
              className="text-sm text-primary underline-offset-4 hover:underline"
            >
              Salir
            </button>
          </div>
        </div>

        <nav
          aria-label="Secciones de administración"
          className="flex gap-1 overflow-x-auto px-2 pb-2 lg:flex-col lg:pb-0"
        >
          {LINKS.map((link) => (
            <NavLink key={link.to} to={link.to} end={link.fin} className={linkClases}>
              {link.label}
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto hidden flex-col gap-1 px-4 py-4 lg:flex">
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

      <main className="w-full min-w-0 px-5 py-6 sm:px-6 lg:px-10 lg:py-8">
        <Outlet />
      </main>
    </div>
  )
}

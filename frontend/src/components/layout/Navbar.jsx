import { NavLink } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { ROLES } from '../../constants/roles'
import RoleBadge from '../auth/RoleBadge'
import Button from '../ui/Button'

const NAVS = {
  [ROLES.CLIENTE]: {
    panel: '/cliente',
    links: [
      { to: '/cliente/solicitudes', label: 'Mis solicitudes' },
      { to: '/cliente/solicitudes/nueva', label: 'Nueva solicitud' },
      { to: '/cliente/perfil', label: 'Perfil' },
    ],
  },
  [ROLES.TECNICO]: {
    panel: '/tecnico',
    links: [
      { to: '/tecnico/disponibles', label: 'Disponibles' },
      { to: '/tecnico/trabajos', label: 'Mis trabajos' },
      { to: '/tecnico/perfil', label: 'Perfil' },
    ],
  },
  [ROLES.ADMIN]: {
    panel: '/admin',
    links: [
      { to: '/admin/solicitudes', label: 'Solicitudes' },
      { to: '/admin/usuarios', label: 'Usuarios' },
    ],
  },
}

const linkClass = ({ isActive }) =>
  `whitespace-nowrap rounded-field px-2 py-1 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
    isActive ? 'font-semibold text-primary' : 'text-text-muted hover:text-text'
  }`

export default function Navbar() {
  const { user, role, logout } = useAuth()
  const nav = NAVS[role]

  return (
    <header className="border-b border-border bg-surface">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
        <NavLink
          to={nav?.panel ?? '/'}
          className="text-lg font-bold text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          UrbanFix
        </NavLink>

        {nav ? (
          <nav className="order-3 flex w-full gap-2 overflow-x-auto sm:order-none sm:w-auto">
            {nav.links.map((link) => (
              <NavLink key={link.to} to={link.to} className={linkClass}>
                {link.label}
              </NavLink>
            ))}
          </nav>
        ) : null}

        <div className="ml-auto flex items-center gap-3">
          {user ? <span className="hidden text-sm text-text-muted sm:inline">{user.name}</span> : null}
          {role ? <RoleBadge role={role} /> : null}
          <Button variant="ghost" onClick={logout}>
            Salir
          </Button>
        </div>
      </div>
    </header>
  )
}

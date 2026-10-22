import { useEffect, useRef, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { ROLES } from '../../constants/roles'
import RoleBadge from '../auth/RoleBadge'

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

const linkMenuClass = ({ isActive }) =>
  `block rounded-field px-3 py-2 text-sm transition-colors ${
    isActive ? 'bg-primary/5 font-semibold text-primary' : 'text-text hover:bg-bg'
  }`

function CaretIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  )
}

export default function Navbar() {
  const { user, role, logout } = useAuth()
  const location = useLocation()
  const nav = NAVS[role]
  const [abierto, setAbierto] = useState(false)
  const [rutaAbierta, setRutaAbierta] = useState(location.pathname)
  const contenedorRef = useRef(null)

  if (rutaAbierta !== location.pathname) {
    setRutaAbierta(location.pathname)
    setAbierto(false)
  }

  useEffect(() => {
    if (!abierto) return undefined

    function handleClicFuera(event) {
      if (contenedorRef.current && !contenedorRef.current.contains(event.target)) {
        setAbierto(false)
      }
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') setAbierto(false)
    }

    document.addEventListener('mousedown', handleClicFuera)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClicFuera)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [abierto])

  const nombre = user?.name?.trim() ? user.name.trim().split(' ')[0] : 'Cuenta'

  return (
    <header className="border-b border-border bg-surface">
      <div className="relative mx-auto flex w-full max-w-5xl items-center justify-between px-5 py-3 sm:px-6">
        <NavLink
          to={nav?.panel ?? '/'}
          className="text-lg font-bold text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          UrbanFix
        </NavLink>

        <div ref={contenedorRef} className="relative">
          <button
            type="button"
            aria-haspopup="true"
            aria-expanded={abierto}
            onClick={() => setAbierto((valor) => !valor)}
            className="flex min-h-9 items-center gap-1 rounded-field px-2 py-1 text-sm font-medium text-text transition-colors hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            {nombre}
            <CaretIcon />
          </button>

          {abierto ? (
            <div className="absolute right-0 top-full z-30 mt-1 w-60 rounded-card border border-border bg-surface p-2 shadow-md">
              <div className="flex items-center justify-between gap-2 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-text">{user?.name ?? nombre}</p>
                  {user?.email ? (
                    <p className="truncate text-xs text-text-muted">{user.email}</p>
                  ) : null}
                </div>
                {role ? <RoleBadge role={role} /> : null}
              </div>

              <hr className="my-1 border-border" />

              {nav ? (
                <nav className="flex flex-col">
                  {nav.links.map((link) => (
                    <NavLink key={link.to} to={link.to} className={linkMenuClass}>
                      {link.label}
                    </NavLink>
                  ))}
                </nav>
              ) : null}

              <hr className="my-1 border-border" />

              <button
                type="button"
                onClick={logout}
                className="w-full rounded-field px-3 py-2 text-left text-sm text-text transition-colors hover:bg-bg"
              >
                Salir
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  )
}

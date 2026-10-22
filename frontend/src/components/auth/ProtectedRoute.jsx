import { Navigate, Outlet, useLocation } from 'react-router-dom'
import Spinner from '../ui/Spinner'
import AppShell from '../layout/AppShell'
import { useAuth } from '../../hooks/useAuth'

export default function ProtectedRoute({ roles, shell = true }) {
  const { isAuthenticated, role, status } = useAuth()
  const location = useLocation()

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner size="lg" />
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  if (roles && roles.length > 0 && !roles.includes(role)) {
    return <Navigate to="/acceso-denegado" replace />
  }

  // El admin tiene su propio shell (sidebar, AdminShell); no usa el AppShell
  // con la Navbar superior.
  if (!shell) {
    return <Outlet />
  }

  return (
    <AppShell>
      <Outlet />
    </AppShell>
  )
}

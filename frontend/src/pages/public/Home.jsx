import { Navigate } from 'react-router-dom'
import { ButtonLink, Spinner } from '../../components/ui'
import { ROLES } from '../../constants/roles'
import { useAuth } from '../../hooks/useAuth'

export default function Home() {
  const { isAuthenticated, user, status } = useAuth()

  // Sesión persistida (localStorage): al cargar la raíz entrás directo a tu panel.
  if (status === 'loading') {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <Spinner size="lg" />
      </main>
    )
  }

  if (isAuthenticated) {
    return <Navigate to={`/${user.role}`} replace />
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center gap-6 px-5 text-center sm:px-6">
      <h1 className="text-3xl font-bold leading-9 text-text">UrbanFix</h1>
      <p className="text-text-muted">
        Marketplace de oficios que conecta clientes con técnicos independientes.
      </p>

      <div className="flex flex-wrap justify-center gap-3">
        <ButtonLink to="/login">Iniciar sesión</ButtonLink>
        <ButtonLink to="/registro" variant="secondary">
          Crear cuenta
        </ButtonLink>
      </div>

      <p className="text-xs text-text-muted">
        Perfiles soportados: {Object.values(ROLES).join(', ')}
      </p>
    </main>
  )
}

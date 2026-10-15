import RoleBadge from '../../components/auth/RoleBadge'
import { Button, ButtonLink, Spinner } from '../../components/ui'
import { ROLES } from '../../constants/roles'
import { useAuth } from '../../hooks/useAuth'

export default function Home() {
  const { isAuthenticated, user, logout, status } = useAuth()

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center gap-6 px-6 text-center">
      <h1 className="text-3xl font-bold leading-9 text-text">UrbanFix</h1>
      <p className="text-text-muted">
        Marketplace de oficios que conecta clientes con técnicos independientes.
      </p>

      {status === 'loading' ? (
        <Spinner size="lg" />
      ) : isAuthenticated ? (
        <div className="flex flex-col items-center gap-3">
          <p className="flex items-center gap-2 text-sm text-text-muted">
            Sesión activa: {user.email} <RoleBadge role={user.role} />
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <ButtonLink to={`/${user.role}`}>Ir a mi panel</ButtonLink>
            <Button variant="secondary" onClick={logout}>
              Cerrar sesión
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap justify-center gap-3">
          <ButtonLink to="/login">Iniciar sesión</ButtonLink>
          <ButtonLink to="/registro" variant="secondary">
            Crear cuenta
          </ButtonLink>
        </div>
      )}

      <p className="text-xs text-text-muted">
        Perfiles soportados: {Object.values(ROLES).join(', ')}
      </p>
    </main>
  )
}

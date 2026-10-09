import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Button, ErrorAlert, Input, Select } from '../../components/ui'
import { ROLES } from '../../constants/roles'
import { useAuth } from '../../hooks/useAuth'
import { isMockAuth } from '../../services/auth'

export default function Login() {
  const { login, status } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState(ROLES.CLIENTE)
  const [error, setError] = useState(null)

  const isLoading = status === 'loading'
  const from = location.state?.from?.pathname ?? `/${role}`

  async function handleSubmit(event) {
    event.preventDefault()
    setError(null)
    try {
      await login({ email, password, role })
      navigate(from, { replace: true })
    } catch (err) {
      setError(err.message ?? 'No se pudo iniciar sesión')
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-6">
      <h1 className="text-3xl font-bold text-slate-900">Iniciar sesión</h1>

      {isMockAuth() ? (
        <p className="rounded border border-dashed border-slate-300 px-3 py-1 text-xs uppercase tracking-wide text-slate-400">
          Auth simulada (sin backend)
        </p>
      ) : null}

      {error ? <ErrorAlert message={error} /> : null}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Input
          label="Email"
          type="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="vo@urbanfix.com"
        />
        <Input
          label="Contraseña"
          type="password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="••••••••"
        />
        <Select
          label="Perfil"
          value={role}
          onChange={(event) => setRole(event.target.value)}
          options={[
            { value: ROLES.CLIENTE, label: 'Cliente' },
            { value: ROLES.TECNICO, label: 'Técnico' },
            { value: ROLES.ADMIN, label: 'Administrador' },
          ]}
        />

        <Button type="submit" loading={isLoading}>
          Entrar
        </Button>
      </form>

      <p className="text-sm text-slate-500">
        ¿No tenés cuenta?{' '}
        <Link className="underline" to="/registro">
          Crear cuenta
        </Link>
      </p>
    </main>
  )
}

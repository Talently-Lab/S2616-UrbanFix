import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ROLES } from '../../constants/roles'
import { useAuth } from '../../hooks/useAuth'

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState(ROLES.CLIENTE)

  const from = location.state?.from?.pathname ?? `/${role}`

  function handleSubmit(event) {
    event.preventDefault()
    login(email, role)
    navigate(from, { replace: true })
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-6">
      <h1 className="text-3xl font-bold text-slate-900">Iniciar sesión</h1>
      <p className="rounded border border-dashed border-slate-300 px-3 py-1 text-xs uppercase tracking-wide text-slate-400">
        Stub de autenticación (sin backend)
      </p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm text-slate-700">
          Email
          <input
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="rounded border border-slate-300 px-3 py-2 text-slate-900"
            placeholder="vo@urbanfix.com"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm text-slate-700">
          Perfil
          <select
            value={role}
            onChange={(event) => setRole(event.target.value)}
            className="rounded border border-slate-300 px-3 py-2 text-slate-900"
          >
            <option value={ROLES.CLIENTE}>Cliente</option>
            <option value={ROLES.TECNICO}>Técnico</option>
            <option value={ROLES.ADMIN}>Administrador</option>
          </select>
        </label>

        <button type="submit" className="rounded bg-slate-900 px-4 py-2 text-white">
          Entrar
        </button>
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

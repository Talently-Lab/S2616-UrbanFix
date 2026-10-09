import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button, ErrorAlert, Input, Select } from '../../components/ui'
import { ROLES } from '../../constants/roles'
import { useAuth } from '../../hooks/useAuth'
import { useToast } from '../../hooks/useToast'

export default function Register() {
  const { register, status } = useAuth()
  const { show } = useToast()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState(ROLES.CLIENTE)
  const [error, setError] = useState(null)

  const isLoading = status === 'loading'

  async function handleSubmit(event) {
    event.preventDefault()
    setError(null)
    try {
      await register({ name, email, password, role })
      show('Cuenta creada con éxito', 'success')
      navigate(`/${role}`, { replace: true })
    } catch (err) {
      setError(err.message ?? 'No se pudo crear la cuenta')
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-6">
      <h1 className="text-3xl font-bold text-slate-900">Crear cuenta</h1>

      {error ? <ErrorAlert message={error} /> : null}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Input
          label="Nombre"
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Tu nombre"
        />
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
          minLength={6}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Mínimo 6 caracteres"
        />
        <Select
          label="Me registro como"
          value={role}
          onChange={(event) => setRole(event.target.value)}
          options={[
            { value: ROLES.CLIENTE, label: 'Cliente' },
            { value: ROLES.TECNICO, label: 'Técnico' },
          ]}
        />

        <Button type="submit" loading={isLoading}>
          Crear cuenta
        </Button>
      </form>

      <p className="text-sm text-slate-500">
        ¿Ya tenés cuenta?{' '}
        <Link className="underline" to="/login">
          Iniciar sesión
        </Link>
      </p>
    </main>
  )
}

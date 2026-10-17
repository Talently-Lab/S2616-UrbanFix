import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import AuthLayout from '../../components/auth/AuthLayout'
import { Button, ErrorAlert, Input, Select } from '../../components/ui'
import {
  AUTH_MESSAGES,
  EMAIL_PATTERN,
  FIELD_ERRORS,
  fieldsFromDetails,
  isCredentialsError,
} from '../../constants/authMessages'
import { ROLES } from '../../constants/roles'
import { useAuth } from '../../hooks/useAuth'
import { isMockAuth } from '../../services/auth'

const COPY = AUTH_MESSAGES.login

function validate({ email, password }) {
  const errors = {}
  if (!EMAIL_PATTERN.test(email)) errors.email = FIELD_ERRORS.emailInvalid
  if (!password) errors.password = FIELD_ERRORS.passwordInvalid
  return errors
}

export default function Login() {
  const { login, status } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState(ROLES.CLIENTE)
  const [error, setError] = useState(null)
  const [fieldErrors, setFieldErrors] = useState({})

  const isLoading = status === 'loading'
  const from = location.state?.from?.pathname

  function clearFieldError(field) {
    setFieldErrors((current) => {
      if (!current[field]) return current
      const next = { ...current }
      delete next[field]
      return next
    })
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError(null)

    const errors = validate({ email, password })
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) return

    try {
      const session = await login({ email, password, role })
      navigate(from ?? `/${session.user.role}`, { replace: true })
    } catch (err) {
      const message = err.message ?? ''
      if (isCredentialsError(message)) {
        setError(COPY.invalidCredentials)
        setFieldErrors({ email: FIELD_ERRORS.emailInvalid, password: FIELD_ERRORS.passwordInvalid })
        return
      }
      const mapped = fieldsFromDetails(err)
      if (Object.keys(mapped).length > 0) setFieldErrors(mapped)
      else setError(message || COPY.invalidCredentials)
    }
  }

  return (
    <AuthLayout title={COPY.title} subtitle={COPY.subtitle}>
      {isMockAuth() ? (
        <p className="rounded border border-dashed border-border px-3 py-1 text-xs uppercase tracking-wide text-text-muted">
          Auth simulada (sin backend)
        </p>
      ) : null}

      {error ? <ErrorAlert message={error} /> : null}

      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        <Input
          label="Correo electrónico"
          type="email"
          aria-required="true"
          autoComplete="email"
          value={email}
          onChange={(event) => {
            setEmail(event.target.value)
            clearFieldError('email')
          }}
          placeholder="nombre@correo.com"
          error={fieldErrors.email}
        />
        <Input
          label="Contraseña"
          type="password"
          aria-required="true"
          autoComplete="current-password"
          value={password}
          onChange={(event) => {
            setPassword(event.target.value)
            clearFieldError('password')
          }}
          placeholder="••••••••"
          error={fieldErrors.password}
        />
        {isMockAuth() ? (
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
        ) : null}

        <Button type="submit" loading={isLoading} className="w-full">
          {isLoading ? COPY.submitting : COPY.submit}
        </Button>
      </form>

      <p className="text-sm text-text-muted">
        ¿No tenés cuenta?{' '}
        <Link className="font-medium text-primary underline" to="/registro">
          {COPY.alternateLink}
        </Link>
      </p>
    </AuthLayout>
  )
}

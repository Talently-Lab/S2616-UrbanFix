import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import AuthLayout from '../../components/auth/AuthLayout'
import { Button, ErrorAlert, Input, SegmentedControl } from '../../components/ui'
import {
  AUTH_MESSAGES,
  EMAIL_PATTERN,
  FIELD_ERRORS,
  fieldsFromDetails,
  isEmailTaken,
  isShortPassword,
} from '../../constants/authMessages'
import { ROLES } from '../../constants/roles'
import { useAuth } from '../../hooks/useAuth'
import { useToast } from '../../hooks/useToast'

const COPY = AUTH_MESSAGES.register

function validate({ name, email, password }) {
  const errors = {}
  if (!name.trim()) errors.name = FIELD_ERRORS.nameRequired
  if (!EMAIL_PATTERN.test(email)) errors.email = FIELD_ERRORS.emailInvalid
  if (password.length < 8) errors.password = FIELD_ERRORS.passwordShort
  return errors
}

function mapRegisterError(error) {
  const fields = fieldsFromDetails(error)
  if (Object.keys(fields).length > 0) return fields
  if (isEmailTaken(error?.message)) return { email: FIELD_ERRORS.emailTaken }
  if (isShortPassword(error?.message)) return { password: FIELD_ERRORS.passwordShort }
  return null
}

export default function Register() {
  const { register, status } = useAuth()
  const { show } = useToast()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [celular, setCelular] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState(ROLES.CLIENTE)
  const [error, setError] = useState(null)
  const [fieldErrors, setFieldErrors] = useState({})
  const [submitted, setSubmitted] = useState(false)

  const isLoading = status === 'loading'

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
    setSubmitted(true)

    const errors = validate({ name, email, password })
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) return

    try {
      const session = await register({ name, email, password, celular, role })
      show('Cuenta creada con éxito', 'success')
      navigate(`/${session.user.role}`, { replace: true })
    } catch (err) {
      const mapped = mapRegisterError(err)
      if (mapped) setFieldErrors(mapped)
      else setError(err.message ?? COPY.submitError)
    }
  }

  return (
    <AuthLayout title={COPY.title} subtitle={COPY.subtitle}>
      {error ? <ErrorAlert message={error} /> : null}

      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        <SegmentedControl
          label="Quiero"
          value={role}
          onChange={setRole}
          options={[
            { value: ROLES.CLIENTE, label: 'Pedir un servicio' },
            { value: ROLES.TECNICO, label: 'Soy técnico' },
          ]}
        />

        <Input
          label="Nombre completo"
          aria-required="true"
          autoComplete="name"
          value={name}
          onChange={(event) => {
            setName(event.target.value)
            clearFieldError('name')
          }}
          placeholder="Ana Pérez"
          error={fieldErrors.name}
        />
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
          label="Celular (opcional)"
          type="tel"
          autoComplete="tel"
          value={celular}
          onChange={(event) => setCelular(event.target.value)}
          placeholder="11 2345 6789"
          hint={submitted ? undefined : COPY.celularHint}
        />
        <Input
          label="Contraseña"
          type="password"
          aria-required="true"
          autoComplete="new-password"
          value={password}
          onChange={(event) => {
            setPassword(event.target.value)
            clearFieldError('password')
          }}
          placeholder="••••••••"
          hint={submitted ? undefined : COPY.passwordHint}
          error={fieldErrors.password}
        />

        <Button type="submit" loading={isLoading} className="w-full">
          {isLoading ? COPY.submitting : COPY.submit}
        </Button>
      </form>

      <p className="text-sm text-text-muted">
        ¿Ya tenés cuenta?{' '}
        <Link className="font-medium text-primary underline" to="/login">
          {COPY.alternateLink}
        </Link>
      </p>
    </AuthLayout>
  )
}

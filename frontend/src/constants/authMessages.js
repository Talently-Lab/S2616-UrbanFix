export const AUTH_MESSAGES = {
  register: {
    title: 'Creá tu cuenta',
    subtitle: 'Es gratis y lleva un minuto.',
    submit: 'Crear cuenta',
    submitting: 'Creando cuenta...',
    alternateLink: 'Ingresá',
    celularHint: 'Lo ve el técnico que acepta tu solicitud.',
    passwordHint: 'Mínimo 8 caracteres.',
    submitError: 'No se pudo crear la cuenta',
  },
  login: {
    title: 'Ingresá a tu cuenta',
    subtitle: 'Entrá para pedir o gestionar servicios del hogar.',
    submit: 'Ingresar',
    submitting: 'Ingresando...',
    alternateLink: 'Registrate',
    invalidCredentials:
      'No pudimos iniciar sesión. Revisá tu correo y tu contraseña e intentá de nuevo.',
  },
}

export const FIELD_ERRORS = {
  nameRequired: 'Completá tu nombre.',
  emailInvalid: 'Revisá que esté bien escrito.',
  emailTaken: 'Este correo ya tiene una cuenta. Probá ingresar.',
  passwordShort: 'Usá al menos 8 caracteres.',
  passwordInvalid: 'Revisá tu contraseña.',
}

const DESIGN_MESSAGE_BY_FIELD = {
  name: FIELD_ERRORS.nameRequired,
  email: FIELD_ERRORS.emailInvalid,
  password: FIELD_ERRORS.passwordShort,
}

const DETAIL_FIELD_TO_FORM = {
  nombre: 'name',
  name: 'name',
  email: 'email',
  password: 'password',
  celular: 'celular',
}

export function fieldsFromDetails(error) {
  const fields = {}
  for (const detail of error?.details ?? []) {
    const field = DETAIL_FIELD_TO_FORM[detail.field]
    if (!field) continue
    fields[field] = DESIGN_MESSAGE_BY_FIELD[field] ?? detail.message
  }
  return fields
}

export function isEmailTaken(message = '') {
  return /ya registrado|ya tiene una cuenta|ya est[aá] en uso/i.test(message)
}

export function isShortPassword(message = '') {
  return /m[ií]nimo\s*8|al\s*menos\s*8/i.test(message)
}

export function isCredentialsError(message = '') {
  return /credenciales/i.test(message)
}

export const EMAIL_PATTERN = /^\S+@\S+\.\S+$/

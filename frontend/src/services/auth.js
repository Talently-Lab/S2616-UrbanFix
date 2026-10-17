import api, { extractErrorMessage } from './api'

const MOCK_ENABLED = import.meta.env.VITE_MOCK_AUTH !== 'false'
const STORAGE_KEY = 'urbanfix.session'
const MOCK_USERS_KEY = 'urbanfix.mock.users'

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function readStoredSession() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function readMockEmails() {
  try {
    const raw = window.localStorage.getItem(MOCK_USERS_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function normalizeUser(usuario) {
  return {
    id: usuario.id ?? null,
    email: usuario.email,
    name: usuario.nombre ?? usuario.name ?? '',
    role: (usuario.rol ?? usuario.role ?? 'cliente').toLowerCase(),
    celular: usuario.celular ?? null,
    fechaCreacion: usuario.fechaCreacion ?? null,
  }
}

function toSession(payload) {
  return {
    token: payload.token,
    user: normalizeUser(payload.usuario ?? payload.user),
  }
}

function toApiError(err, fallback) {
  const error = new Error(extractErrorMessage(err, fallback))
  error.status = err?.response?.status ?? null
  error.details = err?.response?.data?.error?.details ?? null
  return error
}

export async function login({ email, password, role }) {
  if (MOCK_ENABLED) {
    await delay(400)
    if (!email?.includes('@')) {
      throw new Error('Ingresá un email válido')
    }
    if (!password) {
      throw new Error('La contraseña es obligatoria')
    }
    return { token: 'mock-token', user: normalizeUser({ email, rol: role ?? 'cliente' }) }
  }

  try {
    const { data } = await api.post('/auth/login', { email, password })
    return toSession(data.data)
  } catch (err) {
    throw toApiError(err, 'No se pudo iniciar sesión')
  }
}

export async function register(payload) {
  if (MOCK_ENABLED) {
    await delay(400)
    if (!payload.email?.includes('@')) {
      throw new Error('Ingresá un email válido')
    }
    if (!payload.password || payload.password.length < 8) {
      throw new Error('La contraseña debe tener al menos 8 caracteres')
    }
    const emails = readMockEmails()
    if (emails.includes(payload.email)) {
      throw new Error('Email ya registrado')
    }
    window.localStorage.setItem(MOCK_USERS_KEY, JSON.stringify([...emails, payload.email]))
    return {
      token: 'mock-token',
      user: normalizeUser({ email: payload.email, nombre: payload.name, rol: payload.role }),
    }
  }

  try {
    const body = {
      email: payload.email,
      password: payload.password,
      nombre: payload.name,
      celular: payload.celular || null,
      rol: payload.role?.toUpperCase() ?? 'CLIENTE',
    }
    const { data } = await api.post('/auth/register', body)
    return toSession(data.data)
  } catch (err) {
    throw toApiError(err, 'No se pudo crear la cuenta')
  }
}

export async function me() {
  if (MOCK_ENABLED) {
    await delay(200)
    const stored = readStoredSession()
    if (!stored?.user) {
      throw new Error('Sesión inválida')
    }
    return stored.user
  }

  try {
    const { data } = await api.get('/auth/me')
    return normalizeUser(data.data)
  } catch (err) {
    throw new Error(extractErrorMessage(err, 'La sesión no es válida'))
  }
}

export function isMockAuth() {
  return MOCK_ENABLED
}

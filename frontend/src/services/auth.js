import { api } from './client'

const MOCK_ENABLED = import.meta.env.VITE_MOCK_AUTH !== 'false'
const STORAGE_KEY = 'urbanfix.session'

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

export async function login({ email, password, role }) {
  if (MOCK_ENABLED) {
    await delay(400)
    if (!email?.includes('@')) {
      throw new Error('Ingresá un email válido')
    }
    if (!password) {
      throw new Error('La contraseña es obligatoria')
    }
    return { token: 'mock-token', user: { email, role: role ?? 'cliente' } }
  }

  const { data } = await api.post('/auth/login', { email, password })
  return data
}

export async function register(payload) {
  if (MOCK_ENABLED) {
    await delay(400)
    if (!payload.email?.includes('@')) {
      throw new Error('Ingresá un email válido')
    }
    if (!payload.password || payload.password.length < 6) {
      throw new Error('La contraseña debe tener al menos 6 caracteres')
    }
    return {
      token: 'mock-token',
      user: { email: payload.email, role: payload.role ?? 'cliente' },
    }
  }

  const { data } = await api.post('/auth/register', payload)
  return data
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

  const { data } = await api.get('/auth/me')
  return data
}

export function isMockAuth() {
  return MOCK_ENABLED
}

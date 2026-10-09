import { useCallback, useEffect, useMemo, useState } from 'react'
import * as authService from '../services/auth'
import { AuthContext } from './auth-context'

const STORAGE_KEY = 'urbanfix.session'

function readStoredSession() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function persistSession(session) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session))
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [status, setStatus] = useState(() => (readStoredSession()?.token ? 'loading' : 'idle'))
  const [error, setError] = useState(null)

  useEffect(() => {
    const stored = readStoredSession()
    if (!stored?.token) {
      return
    }

    let cancelled = false

    authService
      .me()
      .then((user) => {
        if (cancelled) return
        setSession({ token: stored.token, user })
        setStatus('authenticated')
      })
      .catch(() => {
        if (cancelled) return
        window.localStorage.removeItem(STORAGE_KEY)
        setStatus('idle')
      })

    return () => {
      cancelled = true
    }
  }, [])

  const login = useCallback(async ({ email, password, role }) => {
    setStatus('loading')
    setError(null)
    try {
      const next = await authService.login({ email, password, role })
      persistSession(next)
      setSession(next)
      setStatus('authenticated')
      return next
    } catch (err) {
      setStatus('error')
      setError(err.message ?? 'No se pudo iniciar sesión')
      throw err
    }
  }, [])

  const register = useCallback(async (payload) => {
    setStatus('loading')
    setError(null)
    try {
      const next = await authService.register(payload)
      persistSession(next)
      setSession(next)
      setStatus('authenticated')
      return next
    } catch (err) {
      setStatus('error')
      setError(err.message ?? 'No se pudo crear la cuenta')
      throw err
    }
  }, [])

  const logout = useCallback(() => {
    window.localStorage.removeItem(STORAGE_KEY)
    setSession(null)
    setError(null)
    setStatus('idle')
  }, [])

  const value = useMemo(
    () => ({
      user: session?.user ?? null,
      role: session?.user?.role ?? null,
      isAuthenticated: Boolean(session),
      status,
      error,
      login,
      register,
      logout,
    }),
    [session, status, error, login, register, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

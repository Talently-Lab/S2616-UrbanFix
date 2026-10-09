import { useCallback, useMemo, useState } from 'react'
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

export function AuthProvider({ children }) {
  const [user, setUser] = useState(readStoredSession)

  const login = useCallback((email, role) => {
    const session = { email, role }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session))
    setUser(session)
    return session
  }, [])

  const logout = useCallback(() => {
    window.localStorage.removeItem(STORAGE_KEY)
    setUser(null)
  }, [])

  const value = useMemo(
    () => ({ user, isAuthenticated: Boolean(user), role: user?.role ?? null, login, logout }),
    [user, login, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

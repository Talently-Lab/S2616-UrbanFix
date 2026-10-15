import axios from 'axios'

const STORAGE_KEY = 'urbanfix.session'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:3001/api',
})

api.interceptors.request.use((config) => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    const session = raw ? JSON.parse(raw) : null
    if (session?.token) {
      config.headers.Authorization = `Bearer ${session.token}`
    }
  } catch {
    // sesión corrupta: se ignora y se pide login
  }
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      window.localStorage.removeItem(STORAGE_KEY)
      if (!window.location.pathname.startsWith('/login')) {
        window.location.assign('/login')
      }
    }
    return Promise.reject(error)
  },
)

export function extractErrorMessage(error, fallback = 'Ocurrió un error inesperado') {
  return error?.response?.data?.error?.message ?? error?.message ?? fallback
}

export default api

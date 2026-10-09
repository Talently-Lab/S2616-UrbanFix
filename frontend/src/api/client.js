import axios from 'axios'

const STORAGE_KEY = 'urbanfix.session'

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api',
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

import api, { extractErrorMessage } from './api'
import { isMockAuth } from './auth'

// Contrato: backend/docs/API_CONTRACT.md §7 (GET/POST /solicitudes).
// En modo mock (VITE_MOCK_AUTH) los datos viven en localStorage para poder
// probar el flujo completo sin backend, igual que hace services/auth.js.

const MOCK_KEY = 'urbanfix.mock.solicitudes'
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

function readMockStore() {
  try {
    const raw = window.localStorage.getItem(MOCK_KEY)
    const items = raw ? JSON.parse(raw) : []
    return Array.isArray(items) ? items : []
  } catch {
    return []
  }
}

function writeMockStore(items) {
  window.localStorage.setItem(MOCK_KEY, JSON.stringify(items))
}

function filtrarPorRol(lista, user) {
  if (user?.role === 'cliente') {
    return lista.filter((s) => s.clienteEmail === user.email)
  }
  if (user?.role === 'tecnico') {
    return lista.filter((s) => s.estado === 'PENDIENTE' || s.tecnicoEmail === user.email)
  }
  return lista
}

export async function listar(params = {}) {
  if (isMockAuth()) {
    await delay(300)
    const user = readStoredSession()?.user ?? null
    let lista = filtrarPorRol(readMockStore(), user)

    if (params.estado) lista = lista.filter((s) => s.estado === params.estado)
    if (params.categoria) lista = lista.filter((s) => s.categoria === params.categoria)

    lista.sort((a, b) => new Date(b.fechaCreacion) - new Date(a.fechaCreacion))

    const page = Number(params.page) || 1
    const limit = Number(params.limit) || 20
    const data = lista.slice((page - 1) * limit, page * limit)
    return { data, meta: { page, limit, total: lista.length } }
  }

  try {
    const { data } = await api.get('/solicitudes', { params })
    return {
      data: data.data ?? [],
      meta: data.meta ?? { page: 1, limit: 20, total: 0 },
    }
  } catch (err) {
    throw new Error(extractErrorMessage(err, 'No se pudieron cargar las solicitudes'))
  }
}

export async function crear(payload) {
  if (isMockAuth()) {
    await delay(400)
    const user = readStoredSession()?.user ?? null
    const ahora = new Date().toISOString()
    const solicitud = {
      id: crypto.randomUUID(),
      titulo: payload.titulo,
      descripcion: payload.descripcion,
      categoria: payload.categoria,
      direccion: payload.direccion,
      estado: 'PENDIENTE',
      clienteId: user?.id ?? null,
      clienteEmail: user?.email ?? null,
      tecnicoId: null,
      tecnicoEmail: null,
      cliente: user ? { id: user.id, nombre: user.name, celular: user.celular ?? null } : null,
      tecnico: null,
      fechaCreacion: ahora,
      fechaAceptacion: null,
      fechaInicio: null,
      fechaFinalizacion: null,
      fechaCancelacion: null,
      motivoCancelacion: null,
      fechaActualizacion: ahora,
    }
    writeMockStore([solicitud, ...readMockStore()])
    return solicitud
  }

  try {
    const { data } = await api.post('/solicitudes', payload)
    return data.data
  } catch (err) {
    throw new Error(extractErrorMessage(err, 'No se pudo crear la solicitud'))
  }
}

import api, { extractErrorMessage } from './api'
import { isMockAuth } from './auth'

// Contrato: GET /admin/usuarios (page, limit) y PATCH /admin/usuarios/:id
// (nombre | celular | rol) — backend/src/routes/admin.routes.js.
// En modo mock (VITE_MOCK_AUTH) los usuarios viven en localStorage, igual que
// services/solicitudes.js, para poder probar el panel sin backend.

const MOCK_ROLES_KEY = 'urbanfix.mock.usuarios'
const MOCK_REGISTROS_KEY = 'urbanfix.mock.users'

// Mismos IDs/emails que backend/prisma/seed.js (los 3 usuarios de prueba).
const USUARIOS_SEED = [
  {
    id: 'a1111111-1111-1111-1111-111111111111',
    nombre: 'Juan Pérez',
    email: 'juan@mail.com',
    celular: '3884123456',
    rol: 'CLIENTE',
  },
  {
    id: 'b2222222-2222-2222-2222-222222222222',
    nombre: 'Carlos Gómez',
    email: 'carlos@mail.com',
    celular: '3884987654',
    rol: 'TECNICO',
  },
  {
    id: 'c3333333-3333-3333-3333-333333333333',
    nombre: 'Ana Admin',
    email: 'admin@mail.com',
    celular: '3881111111',
    rol: 'ADMIN',
  },
]

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function readJson(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

function writeJson(key, value) {
  window.localStorage.setItem(key, JSON.stringify(value))
}

function usuariosMock() {
  const cambios = readJson(MOCK_ROLES_KEY, {})
  const registrados = readJson(MOCK_REGISTROS_KEY, [])
  const nuevos = (Array.isArray(registrados) ? registrados : []).map((email) => ({
    id: `mock-${email}`,
    nombre: email.split('@')[0],
    email,
    celular: null,
    rol: 'CLIENTE',
  }))
  return [...USUARIOS_SEED, ...nuevos].map((usuario) => ({
    ...usuario,
    ...(cambios[usuario.id] ?? {}),
  }))
}

export async function listarUsuarios(params = {}) {
  if (isMockAuth()) {
    await delay(300)
    const lista = usuariosMock()
    const page = Number(params.page) || 1
    const limit = Number(params.limit) || 20
    return {
      data: lista.slice((page - 1) * limit, page * limit),
      meta: { page, limit, total: lista.length },
    }
  }

  try {
    const { data } = await api.get('/admin/usuarios', { params })
    return {
      data: data.data ?? [],
      meta: data.meta ?? { page: 1, limit: 20, total: 0 },
    }
  } catch (err) {
    throw new Error(extractErrorMessage(err, 'No se pudieron cargar los usuarios'))
  }
}

export async function actualizarUsuario(id, campos) {
  if (isMockAuth()) {
    await delay(400)
    const cambios = readJson(MOCK_ROLES_KEY, {})
    writeJson(MOCK_ROLES_KEY, { ...cambios, [id]: { ...(cambios[id] ?? {}), ...campos } })
    const usuario = usuariosMock().find((u) => u.id === id)
    if (!usuario) throw new Error('No encontramos ese usuario')
    return usuario
  }

  try {
    const { data } = await api.patch(`/admin/usuarios/${id}`, campos)
    return data.data
  } catch (err) {
    throw new Error(extractErrorMessage(err, 'No se pudo actualizar el usuario'))
  }
}

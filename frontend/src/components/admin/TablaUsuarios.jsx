import { useState } from 'react'
import { Button, EmptyState, ErrorAlert, Input, Select, Spinner } from '../ui'
import RoleBadge from '../auth/RoleBadge'
import { useUsuarios } from '../../hooks/useUsuarios'
import { useToast } from '../../hooks/useToast'
import { actualizarUsuario } from '../../services/admin'

const POR_PAGINA = 6

const ROL_LABEL = { CLIENTE: 'Cliente', TECNICO: 'Técnico', ADMIN: 'Admin' }

const OPCIONES_ROL = [
  { value: '', label: 'Todos' },
  { value: 'CLIENTE', label: 'Cliente' },
  { value: 'TECNICO', label: 'Técnico' },
  { value: 'ADMIN', label: 'Admin' },
]

const OPCIONES_CAMBIO_ROL = OPCIONES_ROL.filter((opcion) => opcion.value !== '')

// C20 — Tabla de usuarios del panel admin (GET /admin/usuarios) con búsqueda,
// filtro por rol, paginación y cambio de rol por fila (PATCH /admin/usuarios/:id)
// con actualización optimista.
export default function TablaUsuarios() {
  const { usuarios, status, error, recargar } = useUsuarios({ limit: 100 })
  const { show } = useToast()

  const [rol, setRol] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [pagina, setPagina] = useState(1)
  const [optimistas, setOptimistas] = useState({})
  const [guardandoId, setGuardandoId] = useState(null)

  const conRol = usuarios.map((usuario) =>
    optimistas[usuario.id] ? { ...usuario, rol: optimistas[usuario.id] } : usuario,
  )

  const texto = busqueda.trim().toLowerCase()
  const filtrados = conRol.filter((usuario) => {
    if (rol && usuario.rol !== rol) return false
    if (texto) {
      const nombre = (usuario.nombre ?? '').toLowerCase()
      const email = (usuario.email ?? '').toLowerCase()
      if (!nombre.includes(texto) && !email.includes(texto)) return false
    }
    return true
  })

  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / POR_PAGINA))
  const paginaVigente = Math.min(pagina, totalPaginas)
  const visibles = filtrados.slice((paginaVigente - 1) * POR_PAGINA, paginaVigente * POR_PAGINA)

  function cambiarFiltro(setter, valor) {
    setter(valor)
    setPagina(1)
  }

  // UI optimista: el badge del rol cambia al instante mientras viaja el PATCH.
  async function cambiarRol(usuario, nuevoRol) {
    setGuardandoId(usuario.id)
    setOptimistas((prev) => ({ ...prev, [usuario.id]: nuevoRol }))
    try {
      await actualizarUsuario(usuario.id, { rol: nuevoRol })
      show(`${usuario.nombre}: rol ${ROL_LABEL[nuevoRol] ?? nuevoRol}`, 'success')
    } catch (err) {
      setOptimistas((prev) => {
        const copia = { ...prev }
        delete copia[usuario.id]
        return copia
      })
      show(err.message ?? 'No se pudo cambiar el rol', 'error')
      recargar()
    } finally {
      setGuardandoId(null)
    }
  }

  if (status === 'loading') {
    return (
      <div className="flex justify-center py-16">
        <Spinner size="lg" />
      </div>
    )
  }

  if (status === 'error') {
    return <ErrorAlert message={error} onRetry={recargar} />
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <Select
          className="w-40"
          aria-label="Filtrar por rol"
          options={OPCIONES_ROL}
          value={rol}
          onChange={(event) => cambiarFiltro(setRol, event.target.value)}
        />
        <Input
          className="max-w-sm flex-1"
          aria-label="Buscar por nombre o email"
          placeholder="Buscar por nombre o email"
          value={busqueda}
          onChange={(event) => cambiarFiltro(setBusqueda, event.target.value)}
        />
      </div>

      {filtrados.length === 0 ? (
        <div className="rounded-card border border-border bg-surface">
          <EmptyState
            icon="👥"
            title="No encontramos usuarios"
            description="Probá con otro rol o quitá la búsqueda."
            action={
              <Button
                variant="secondary"
                onClick={() => {
                  setRol('')
                  setBusqueda('')
                  setPagina(1)
                }}
              >
                Limpiar filtros
              </Button>
            }
          />
        </div>
      ) : (
        <>
          <p className="text-xs text-text-muted sm:hidden">
            Deslizá la tabla para ver el resto de las columnas →
          </p>
          <div className="overflow-x-auto rounded-card border border-border bg-surface">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-text-muted">
                  <th className="px-5 py-3 font-medium">Nombre</th>
                  <th className="px-5 py-3 font-medium">Email</th>
                  <th className="px-5 py-3 font-medium">Celular</th>
                  <th className="px-5 py-3 font-medium">Rol</th>
                  <th className="px-5 py-3 font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((usuario) => (
                  <tr
                    key={usuario.id}
                    className="border-b border-border last:border-b-0 transition-colors hover:bg-bg"
                  >
                    <td className="px-5 py-4 font-semibold text-text">{usuario.nombre}</td>
                    <td className="px-5 py-4 text-text">{usuario.email}</td>
                    <td className="px-5 py-4 text-text-muted">{usuario.celular ?? '—'}</td>
                    <td className="px-5 py-4">
                      <RoleBadge role={(usuario.rol ?? 'cliente').toLowerCase()} />
                    </td>
                    <td className="px-5 py-4">
                      <Select
                        className="w-40"
                        aria-label={`Cambiar rol de ${usuario.nombre}`}
                        options={OPCIONES_CAMBIO_ROL}
                        value={usuario.rol ?? 'CLIENTE'}
                        disabled={guardandoId === usuario.id}
                        onChange={(event) => cambiarRol(usuario, event.target.value)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <nav aria-label="Paginación" className="flex items-center justify-center gap-2 text-sm">
            <button
              type="button"
              className="px-2 py-1 text-text-muted disabled:opacity-40"
              disabled={paginaVigente === 1}
              onClick={() => setPagina(paginaVigente - 1)}
            >
              ‹ Anterior
            </button>
            {Array.from({ length: totalPaginas }, (_, index) => index + 1).map((numero) => (
              <button
                key={numero}
                type="button"
                aria-current={numero === paginaVigente ? 'page' : undefined}
                onClick={() => setPagina(numero)}
                className={`min-h-9 min-w-9 rounded-field border px-2 py-1 font-medium ${
                  numero === paginaVigente
                    ? 'border-primary text-primary'
                    : 'text-text-muted hover:text-text'
                }`}
              >
                {numero}
              </button>
            ))}
            <button
              type="button"
              className="px-2 py-1 text-text-muted disabled:opacity-40"
              disabled={paginaVigente === totalPaginas}
              onClick={() => setPagina(paginaVigente + 1)}
            >
              Siguiente ›
            </button>
          </nav>
        </>
      )}
    </div>
  )
}

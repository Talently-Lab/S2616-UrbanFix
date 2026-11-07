import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button, EmptyState, ErrorAlert, Input, Select, Spinner } from '../ui'
import EstadoSolicitudBadge from '../solicitudes/EstadoSolicitudBadge'
import ModalCancelarOrden from './ModalCancelarOrden'
import { etiquetaCategoria, opcionesCategorias } from '../../constants/categorias'
import { opcionesEstados } from '../../constants/estadosSolicitud'
import { cancelar } from '../../services/solicitudes'

const POR_PAGINA = 6

const OPCIONES_ESTADO = [{ value: '', label: 'Todos' }, ...opcionesEstados()]
const OPCIONES_CATEGORIA = [{ value: '', label: 'Todas' }, ...opcionesCategorias()]

// El backend solo permite cancelar desde PENDIENTE o ACEPTADA
// (backend/docs/API_CONTRACT.md §7 · PATCH /solicitudes/:id/cancelar).
const CANCELABLES = ['PENDIENTE', 'ACEPTADA']

function fechaCorta(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })
}

// A2 — Listado de solicitudes de la plataforma (Figma pág. 04) + moderación
// (Semana 6): filtros por estado/categoría/búsqueda, paginación y botón
// «Cancelar orden» por fila con actualización optimista.
export default function TablaSolicitudes({
  solicitudes = [],
  status = 'ready',
  error = null,
  recargar = () => {},
}) {
  const navigate = useNavigate()

  const [estado, setEstado] = useState('')
  const [categoria, setCategoria] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [pagina, setPagina] = useState(1)
  const [cancelando, setCancelando] = useState(null)
  const [optimistas, setOptimistas] = useState({})

  const conEstado = solicitudes.map((solicitud) =>
    optimistas[solicitud.id] ? { ...solicitud, estado: optimistas[solicitud.id] } : solicitud,
  )

  const texto = busqueda.trim().toLowerCase()
  const filtradas = conEstado.filter((solicitud) => {
    if (estado && solicitud.estado !== estado) return false
    if (categoria && solicitud.categoria !== categoria) return false
    if (texto) {
      const titulo = (solicitud.titulo ?? '').toLowerCase()
      const cliente = (solicitud.cliente?.nombre ?? '').toLowerCase()
      if (!titulo.includes(texto) && !cliente.includes(texto)) return false
    }
    return true
  })

  const totalPaginas = Math.max(1, Math.ceil(filtradas.length / POR_PAGINA))
  const paginaVigente = Math.min(pagina, totalPaginas)
  const visibles = filtradas.slice((paginaVigente - 1) * POR_PAGINA, paginaVigente * POR_PAGINA)

  function cambiarFiltro(setter, valor) {
    setter(valor)
    setPagina(1)
  }

  function limpiarFiltros() {
    setEstado('')
    setCategoria('')
    setBusqueda('')
    setPagina(1)
  }

  // UI optimista: la fila pasa a CANCELADA apenas se dispara el request y se
  // revierte si el backend responde con error.
  async function confirmarCancelacion(motivo) {
    const id = cancelando.id
    setOptimistas((prev) => ({ ...prev, [id]: 'CANCELADA' }))
    try {
      await cancelar(id, motivo)
    } catch (err) {
      setOptimistas((prev) => {
        const copia = { ...prev }
        delete copia[id]
        return copia
      })
      throw err
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
          aria-label="Filtrar por estado"
          options={OPCIONES_ESTADO}
          value={estado}
          onChange={(event) => cambiarFiltro(setEstado, event.target.value)}
        />
        <Select
          className="w-40"
          aria-label="Filtrar por categoría"
          options={OPCIONES_CATEGORIA}
          value={categoria}
          onChange={(event) => cambiarFiltro(setCategoria, event.target.value)}
        />
        <Input
          className="max-w-sm flex-1"
          aria-label="Buscar por título o cliente"
          placeholder="Buscar por título o cliente"
          value={busqueda}
          onChange={(event) => cambiarFiltro(setBusqueda, event.target.value)}
        />
      </div>

      {filtradas.length === 0 ? (
        <div className="rounded-card border border-border bg-surface">
          <EmptyState
            icon="🔍"
            title="No encontramos solicitudes"
            description="Probá con otro estado, otra categoría o quitá la búsqueda."
            action={
              <Button variant="secondary" onClick={limpiarFiltros}>
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
                  <th className="px-5 py-3 font-medium">Título</th>
                  <th className="px-5 py-3 font-medium">Categoría</th>
                  <th className="px-5 py-3 font-medium">Cliente</th>
                  <th className="px-5 py-3 font-medium">Técnico</th>
                  <th className="px-5 py-3 font-medium">Estado</th>
                  <th className="px-5 py-3 font-medium">Fecha</th>
                  <th className="px-5 py-3 font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((solicitud) => (
                  <tr
                    key={solicitud.id}
                    onClick={(event) => {
                      if (event.target.closest('a, button, select, input')) return
                      navigate(`/admin/solicitudes/${solicitud.id}`)
                    }}
                    className="cursor-pointer border-b border-border last:border-b-0 transition-colors hover:bg-bg"
                  >
                    <td className="px-5 py-4 font-semibold text-text">
                      <Link
                        to={`/admin/solicitudes/${solicitud.id}`}
                        className="rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                      >
                        {solicitud.titulo}
                      </Link>
                    </td>
                    <td className="px-5 py-4 text-text">{etiquetaCategoria(solicitud.categoria)}</td>
                    <td className="px-5 py-4 text-text">{solicitud.cliente?.nombre ?? '—'}</td>
                    <td className="px-5 py-4 text-text">
                      {solicitud.tecnico?.nombre ??
                        (solicitud.estado === 'CANCELADA' ? '—' : 'Sin asignar')}
                    </td>
                    <td className="px-5 py-4">
                      <EstadoSolicitudBadge estado={solicitud.estado} />
                    </td>
                    <td className="px-5 py-4 text-text-muted">{fechaCorta(solicitud.fechaCreacion)}</td>
                    <td className="px-5 py-4">
                      {CANCELABLES.includes(solicitud.estado) ? (
                        <Button
                          variant="danger"
                          onClick={() => setCancelando(solicitud)}
                          aria-label={`Cancelar orden: ${solicitud.titulo}`}
                        >
                          Cancelar orden
                        </Button>
                      ) : (
                        <span className="text-text-muted" aria-label="Sin acciones disponibles">
                          —
                        </span>
                      )}
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

      <ModalCancelarOrden
        solicitud={cancelando}
        onClose={() => setCancelando(null)}
        onConfirmar={confirmarCancelacion}
      />
    </div>
  )
}

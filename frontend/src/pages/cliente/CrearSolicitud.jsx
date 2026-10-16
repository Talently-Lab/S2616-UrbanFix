import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, ButtonLink, ErrorAlert, Input, Select, Textarea } from '../../components/ui'
import { CATEGORIAS, opcionesCategorias } from '../../constants/categorias'
import { useToast } from '../../hooks/useToast'
import { crear } from '../../services/solicitudes'

// C10 — SolicitudForm: alta de solicitud (POST /solicitudes).
// Todos los campos son obligatorios (backend/docs/API_CONTRACT.md §7).
export default function CrearSolicitud() {
  const navigate = useNavigate()
  const { show } = useToast()

  const [titulo, setTitulo] = useState('')
  const [categoria, setCategoria] = useState(CATEGORIAS[0])
  const [direccion, setDireccion] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [error, setError] = useState(null)
  const [enviando, setEnviando] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setError(null)

    const payload = {
      titulo: titulo.trim(),
      categoria,
      direccion: direccion.trim(),
      descripcion: descripcion.trim(),
    }

    if (!payload.titulo || !payload.direccion || !payload.descripcion) {
      setError('Completá todos los campos obligatorios.')
      return
    }

    setEnviando(true)
    try {
      await crear(payload)
      show('Solicitud creada con éxito', 'success')
      navigate('/cliente', { replace: true })
    } catch (err) {
      setError(err.message ?? 'No se pudo crear la solicitud')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold text-text">Nueva solicitud</h1>
        <p className="mt-1 text-text-muted">
          Describí el trabajo y los técnicos disponibles lo van a ver.
        </p>
      </header>

      {error ? <ErrorAlert message={error} /> : null}

      <form onSubmit={handleSubmit} className="flex max-w-xl flex-col gap-4">
        <Input
          label="Título"
          required
          value={titulo}
          onChange={(event) => setTitulo(event.target.value)}
          placeholder="Pérdida en la cocina"
          maxLength={120}
        />
        <Select
          label="Categoría"
          required
          value={categoria}
          onChange={(event) => setCategoria(event.target.value)}
          options={opcionesCategorias()}
        />
        <Input
          label="Dirección"
          required
          value={direccion}
          onChange={(event) => setDireccion(event.target.value)}
          placeholder="Av. Siempre Viva 742"
          maxLength={160}
        />
        <Textarea
          label="Descripción"
          required
          rows={5}
          maxLength={500}
          value={descripcion}
          onChange={(event) => setDescripcion(event.target.value)}
          placeholder="Contá qué está pasando, desde cuándo y cualquier detalle que sirva."
        />

        <div className="flex flex-wrap gap-3">
          <Button type="submit" loading={enviando}>
            Crear solicitud
          </Button>
          <ButtonLink to="/cliente" variant="secondary">
            Cancelar
          </ButtonLink>
        </div>
      </form>
    </div>
  )
}

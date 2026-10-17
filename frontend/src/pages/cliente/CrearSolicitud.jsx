import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, ErrorAlert, Input, Select, Textarea } from '../../components/ui'
import { opcionesCategorias } from '../../constants/categorias'
import { useToast } from '../../hooks/useToast'
import { crear } from '../../services/solicitudes'

const OPCIONES_CATEGORIA = [{ value: '', label: 'Elegí una categoría' }, ...opcionesCategorias()]

const CAMPOS = ['titulo', 'categoria', 'descripcion', 'direccion']

function validar({ titulo, categoria, descripcion, direccion }) {
  const errores = {}
  if (!titulo.trim()) errores.titulo = 'El título es obligatorio'
  if (!categoria) errores.categoria = 'Elegí la categoría del servicio.'
  if (descripcion.trim().length < 10) {
    errores.descripcion = 'Contanos un poco más (mínimo 10 caracteres).'
  }
  if (!direccion.trim()) errores.direccion = 'La dirección es obligatoria'
  return errores
}

function erroresDeDetalles(error) {
  const errores = {}
  for (const detalle of error?.details ?? []) {
    if (CAMPOS.includes(detalle.field)) errores[detalle.field] = detalle.message
  }
  return errores
}

export default function CrearSolicitud() {
  const navigate = useNavigate()
  const { show } = useToast()

  const [titulo, setTitulo] = useState('')
  const [categoria, setCategoria] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [direccion, setDireccion] = useState('')
  const [errores, setErrores] = useState({})
  const [error, setError] = useState(null)
  const [enviando, setEnviando] = useState(false)

  function limpiarError(campo) {
    setErrores((actuales) => {
      if (!actuales[campo]) return actuales
      const siguiente = { ...actuales }
      delete siguiente[campo]
      return siguiente
    })
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError(null)

    const errores = validar({ titulo, categoria, descripcion, direccion })
    setErrores(errores)
    if (Object.keys(errores).length > 0) return

    setEnviando(true)
    try {
      await crear({
        titulo: titulo.trim(),
        categoria,
        descripcion: descripcion.trim(),
        direccion: direccion.trim(),
      })
      show('Solicitud creada con éxito', 'success')
      navigate('/cliente', { replace: true })
    } catch (err) {
      const porCampo = erroresDeDetalles(err)
      if (Object.keys(porCampo).length > 0) setErrores(porCampo)
      else setError(err.message ?? 'No se pudo crear la solicitud')
      setEnviando(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-bold text-text">Nueva solicitud</h1>

      {error ? <ErrorAlert message={error} /> : null}

      <form onSubmit={handleSubmit} noValidate className="flex max-w-xl flex-col gap-4">
        <Input
          label="Título"
          aria-required="true"
          value={titulo}
          onChange={(event) => {
            setTitulo(event.target.value)
            limpiarError('titulo')
          }}
          placeholder="Pérdida en la cocina"
          maxLength={120}
          hint="Resumilo en una frase corta."
          error={errores.titulo}
        />
        <Select
          label="Categoría"
          aria-required="true"
          value={categoria}
          onChange={(event) => {
            setCategoria(event.target.value)
            limpiarError('categoria')
          }}
          options={OPCIONES_CATEGORIA}
          error={errores.categoria}
        />
        <Textarea
          label="Descripción"
          aria-required="true"
          rows={5}
          value={descripcion}
          onChange={(event) => {
            setDescripcion(event.target.value)
            limpiarError('descripcion')
          }}
          placeholder="Contá qué está pasando, desde cuándo y cualquier detalle que sirva."
          error={errores.descripcion}
        />
        <Input
          label="Dirección"
          aria-required="true"
          value={direccion}
          onChange={(event) => {
            setDireccion(event.target.value)
            limpiarError('direccion')
          }}
          placeholder="Av. Siempre Viva 742"
          maxLength={160}
          error={errores.direccion}
        />

        <Button type="submit" loading={enviando} className="w-full">
          Enviar solicitud
        </Button>
      </form>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { listar } from '../services/solicitudes'

// Carga el listado de solicitudes según el rol del usuario (GET /solicitudes).
// Los params se serializan para que un objeto nuevo en cada render no dispare
// la petición otra vez; `resultado.clave` permite derivar el estado de carga
// durante el render en lugar de setear estado dentro del effect.
export function useSolicitudes(params) {
  const clave = JSON.stringify(params ?? {})
  const [intento, setIntento] = useState(0)
  const [resultado, setResultado] = useState({
    clave,
    intento,
    status: 'loading',
    solicitudes: [],
    meta: null,
    error: null,
  })

  useEffect(() => {
    let cancelado = false

    listar(JSON.parse(clave))
      .then((r) => {
        if (cancelado) return
        setResultado({
          clave,
          intento,
          status: 'ready',
          solicitudes: r.data,
          meta: r.meta,
          error: null,
        })
      })
      .catch((err) => {
        if (cancelado) return
        setResultado({
          clave,
          intento,
          status: 'error',
          solicitudes: [],
          meta: null,
          error: err.message ?? 'No se pudieron cargar las solicitudes',
        })
      })

    return () => {
      cancelado = true
    }
  }, [clave, intento])

  const vigente = resultado.clave === clave && resultado.intento === intento

  return {
    solicitudes: vigente ? resultado.solicitudes : [],
    meta: vigente ? resultado.meta : null,
    status: vigente ? resultado.status : 'loading',
    error: vigente ? resultado.error : null,
    recargar: () => setIntento((valor) => valor + 1),
  }
}

import { useEffect, useState } from 'react'
import { listarUsuarios } from '../services/admin'

// Listado de usuarios del panel admin (GET /admin/usuarios). Mismo contrato de
// estados que useSolicitudes: loading / ready / error + recargar().
export function useUsuarios(params) {
  const clave = JSON.stringify(params ?? {})
  const [intento, setIntento] = useState(0)
  const [resultado, setResultado] = useState({
    clave,
    intento,
    status: 'loading',
    usuarios: [],
    meta: null,
    error: null,
  })

  useEffect(() => {
    let cancelado = false

    listarUsuarios(JSON.parse(clave))
      .then((r) => {
        if (cancelado) return
        setResultado({
          clave,
          intento,
          status: 'ready',
          usuarios: r.data,
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
          usuarios: [],
          meta: null,
          error: err.message ?? 'No se pudieron cargar los usuarios',
        })
      })

    return () => {
      cancelado = true
    }
  }, [clave, intento])

  const vigente = resultado.clave === clave && resultado.intento === intento

  return {
    usuarios: vigente ? resultado.usuarios : [],
    meta: vigente ? resultado.meta : null,
    status: vigente ? resultado.status : 'loading',
    error: vigente ? resultado.error : null,
    recargar: () => setIntento((valor) => valor + 1),
  }
}

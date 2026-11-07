import { useState } from 'react'
import { Button, ErrorAlert, Input, Modal } from '../ui'
import { useToast } from '../../hooks/useToast'

// Moderación del admin (Semana 6): cancelar una orden con motivo obligatorio
// (PATCH /solicitudes/:id/cancelar exige { motivo }). Misma estructura y copy
// que el modal de rechazo del técnico para que todos los flujos se comporten
// igual. El padre hace la actualización optimista y acá solo se maneja el
// estado del envío y los errores.
export default function ModalCancelarOrden({ solicitud, onClose, onConfirmar }) {
  const { show } = useToast()
  const [motivo, setMotivo] = useState('')
  const [errorMotivo, setErrorMotivo] = useState(null)
  const [errorApi, setErrorApi] = useState(null)
  const [enviando, setEnviando] = useState(false)

  async function manejarCancelacion() {
    if (!motivo.trim()) {
      setErrorMotivo('El motivo es obligatorio.')
      return
    }
    setEnviando(true)
    setErrorApi(null)
    try {
      await onConfirmar(motivo.trim())
      show('Orden cancelada', 'success')
      setMotivo('')
      onClose()
    } catch (err) {
      setErrorApi(err.message ?? 'No se pudo cancelar la orden.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Modal
      open={Boolean(solicitud)}
      onClose={onClose}
      title="¿Cancelar esta orden?"
      footer={
        <div className="flex w-full flex-col gap-3">
          <Button
            variant="danger"
            className="w-full"
            loading={enviando}
            onClick={manejarCancelacion}
          >
            Cancelar orden
          </Button>
          <Button variant="secondary" className="w-full" onClick={onClose} disabled={enviando}>
            Volver
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-sm text-text-muted">
          La solicitud queda cancelada y no se puede deshacer. El motivo se guarda en el
          historial y lo puede leer el cliente.
        </p>
        {errorApi ? <ErrorAlert message={errorApi} /> : null}
        <Input
          label="Motivo (obligatorio)"
          placeholder="Escribí el motivo"
          hint="Por ejemplo: pedido de prueba o solicitud falsa."
          value={motivo}
          onChange={(event) => {
            setMotivo(event.target.value)
            setErrorMotivo(null)
          }}
          error={errorMotivo}
        />
      </div>
    </Modal>
  )
}

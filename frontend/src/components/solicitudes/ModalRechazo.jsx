import { useState } from 'react'
import { Button, ErrorAlert, Input, Modal } from '../ui'
import { useToast } from '../../hooks/useToast'
import { rechazar } from '../../services/solicitudes'

// T5 — Confirmación de rechazo con motivo obligatorio (Figma pág. 04).
export default function ModalRechazo({ solicitud, onClose, onRechazado }) {
  const { show } = useToast()
  const [motivo, setMotivo] = useState('')
  const [errorMotivo, setErrorMotivo] = useState(null)
  const [errorApi, setErrorApi] = useState(null)
  const [enviando, setEnviando] = useState(false)

  async function manejarRechazo() {
    if (!motivo.trim()) {
      setErrorMotivo('El motivo es obligatorio.')
      return
    }
    setEnviando(true)
    setErrorApi(null)
    try {
      await rechazar(solicitud.id, motivo)
      show('Solicitud rechazada', 'success')
      onRechazado()
    } catch (err) {
      setErrorApi(err.message)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Modal
      open={Boolean(solicitud)}
      onClose={onClose}
      title="¿Rechazar este trabajo?"
      footer={
        <div className="flex w-full flex-col gap-3">
          <Button
            variant="danger"
            className="w-full"
            loading={enviando}
            onClick={manejarRechazo}
          >
            Rechazar trabajo
          </Button>
          <Button variant="secondary" className="w-full" onClick={onClose} disabled={enviando}>
            Volver
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-sm text-text-muted">
          La solicitud sigue disponible para otros técnicos. Contanos el motivo.
        </p>
        {errorApi ? <ErrorAlert message={errorApi} /> : null}
        <Input
          label="Motivo (obligatorio)"
          placeholder="Escribí el motivo"
          hint="Lo van a leer el cliente y el técnico. Escribilo claro y breve."
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

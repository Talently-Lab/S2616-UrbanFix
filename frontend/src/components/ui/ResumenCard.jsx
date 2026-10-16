// D10 — ResumenCard (inventario de UX/UI, §2): un número y su título
// para los paneles. Estados: cargando y con dato (falta la forma visual).

export default function ResumenCard({ valor, titulo, className = '' }) {
  return (
    <div className={`rounded-card border border-border bg-surface px-4 py-3 ${className}`}>
      <p className="text-2xl font-bold text-text">{valor}</p>
      <p className="mt-0.5 text-sm text-text-muted">{titulo}</p>
    </div>
  )
}

import TablaUsuarios from '../../components/admin/TablaUsuarios'

// C20 — Gestión de usuarios de la plataforma (Semana 6).
export default function AdminUsuarios() {
  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-3xl font-bold text-text">Gestión de usuarios</h1>
        <p className="mt-1 text-text-muted">
          Clientes y técnicos de la plataforma. Cambiá el rol desde la fila.
        </p>
      </header>

      <TablaUsuarios />
    </div>
  )
}

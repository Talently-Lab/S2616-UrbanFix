export default function PagePlaceholder({ title, description }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-3xl font-bold text-text">{title}</h1>
      {description ? <p className="text-text-muted">{description}</p> : null}
      <p className="rounded border border-dashed border-border px-3 py-1 text-xs uppercase tracking-wide text-text-muted">
        Placeholder pendiente de maquetación
      </p>
    </main>
  )
}

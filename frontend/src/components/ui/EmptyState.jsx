export default function EmptyState({ title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-card border border-dashed border-border px-6 py-12 text-center">
      <h3 className="text-base font-semibold text-text">{title}</h3>
      {description ? <p className="max-w-sm text-sm text-text-muted">{description}</p> : null}
      {action}
    </div>
  )
}

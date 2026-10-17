export default function EmptyState({ title, description, action, icon = null }) {
  return (
    <div className="flex flex-col items-center gap-4 px-2 py-12 text-center">
      {icon ? (
        <span className="text-4xl leading-none" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      <div className="flex flex-col gap-2">
        <h3 className="text-lg font-bold text-text">{title}</h3>
        {description ? <p className="mx-auto max-w-xs text-sm text-text-muted">{description}</p> : null}
      </div>
      {action ? <div className="mx-auto flex w-full max-w-sm justify-center">{action}</div> : null}
    </div>
  )
}

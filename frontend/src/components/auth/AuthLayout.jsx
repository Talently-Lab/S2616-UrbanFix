export default function AuthLayout({ title, subtitle, children }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-start gap-6 px-5 py-10 sm:justify-center sm:px-6">
      <div className="flex flex-col gap-4">
        <span className="text-xl font-bold text-primary">UrbanFix</span>
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-bold text-text">{title}</h1>
          <p className="text-text-muted">{subtitle}</p>
        </div>
      </div>

      {children}
    </main>
  )
}

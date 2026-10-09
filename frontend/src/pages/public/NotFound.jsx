import { Link } from 'react-router-dom'

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 px-6 text-center">
      <h1 className="text-3xl font-bold text-slate-900">404</h1>
      <p className="text-slate-600">La página que buscás no existe.</p>
      <Link className="underline text-slate-700" to="/">
        Volver al inicio
      </Link>
    </main>
  )
}

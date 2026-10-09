import { Link } from 'react-router-dom'

export default function Register() {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-6">
      <h1 className="text-3xl font-bold text-slate-900">Crear cuenta</h1>
      <p className="text-slate-600">
        Placeholder: formulario de registro de clientes y técnicos (pendiente de maquetación).
      </p>
      <p className="text-sm text-slate-500">
        ¿Ya tenés cuenta?{' '}
        <Link className="underline" to="/login">
          Iniciar sesión
        </Link>
      </p>
    </main>
  )
}

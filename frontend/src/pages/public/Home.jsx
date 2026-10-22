import { Link, Navigate } from 'react-router-dom'
import { ButtonLink, Spinner } from '../../components/ui'
import { CATEGORIAS, etiquetaCategoria } from '../../constants/categorias'
import { useAuth } from '../../hooks/useAuth'
import iconAlbanileria from '../../assets/categorias/albanileria.png'
import iconCarpinteria from '../../assets/categorias/carpinteria.png'
import iconCerrajeria from '../../assets/categorias/cerrajeria.png'
import iconElectricidad from '../../assets/categorias/electricidad.png'
import iconGas from '../../assets/categorias/gas.png'
import iconOtro from '../../assets/categorias/otro.png'
import iconPintura from '../../assets/categorias/pintura.png'
import iconPlomeria from '../../assets/categorias/plomeria.png'

const ICONOS = {
  PLOMERIA: iconPlomeria,
  ELECTRICIDAD: iconElectricidad,
  GAS: iconGas,
  CARPINTERIA: iconCarpinteria,
  PINTURA: iconPintura,
  CERRAJERIA: iconCerrajeria,
  ALBANILERIA: iconAlbanileria,
  OTRO: iconOtro,
}

const PASOS = [
  {
    titulo: 'Contanos qué necesitás',
    detalle: 'Elegí la categoría y describí el problema.',
  },
  {
    titulo: 'Un técnico acepta tu pedido',
    detalle: 'Lo ves en «Mis solicitudes» apenas alguien toma tu pedido.',
  },
  {
    titulo: 'Seguí el trabajo',
    detalle: 'Mirá cada cambio de estado hasta que termine.',
  },
]

export default function Home() {
  const { isAuthenticated, user, status } = useAuth()

  // Sesión persistida (localStorage): al cargar la raíz entrás directo a tu panel.
  if (status === 'loading') {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <Spinner size="lg" />
      </main>
    )
  }

  if (isAuthenticated) {
    return <Navigate to={`/${user.role}`} replace />
  }

  return (
    <div className="min-h-screen bg-bg">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-5 py-4">
          <span className="text-lg font-bold text-primary">UrbanFix</span>
          <Link className="text-sm font-medium text-primary underline" to="/login">
            Ingresar
          </Link>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-5 py-8">
        <section className="flex flex-col gap-4">
          <h1 className="text-3xl font-bold leading-9 text-text">
            Arreglamos tu hogar,
            <br />
            sin vueltas
          </h1>
          <p className="text-base text-text-muted">
            Pedí un técnico para tu casa y seguí el estado de tu solicitud desde el celular.
          </p>

          <div className="flex flex-col gap-3 pt-2">
            <ButtonLink to="/registro" className="w-full">
              Pedir un servicio
            </ButtonLink>
            <ButtonLink to="/registro" variant="primary-outline" className="w-full">
              Soy técnico
            </ButtonLink>
          </div>
        </section>

        <section className="flex flex-col gap-5">
          <h2 className="text-2xl font-bold text-text">Cómo funciona</h2>
          <ol className="flex flex-col gap-5">
            {PASOS.map((paso, index) => (
              <li key={paso.titulo} className="flex items-start gap-3">
                <span
                  aria-hidden="true"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-medium text-white"
                >
                  {index + 1}
                </span>
                <div className="flex flex-col gap-1">
                  <p className="text-base font-semibold text-text">{paso.titulo}</p>
                  <p className="text-sm text-text-muted">{paso.detalle}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="flex flex-col gap-4 pb-4">
          <h2 className="text-2xl font-bold text-text">Servicios</h2>
          <ul className="flex flex-wrap gap-2">
            {CATEGORIAS.map((categoria) => (
              <li
                key={categoria}
                className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 text-sm font-medium text-text"
              >
                <img src={ICONOS[categoria]} alt="" className="size-5" />
                {etiquetaCategoria(categoria)}
              </li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  )
}

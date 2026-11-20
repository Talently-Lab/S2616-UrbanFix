# S2616 - UrbanFix

Marketplace de oficios que conecta clientes con técnicos independientes (plomeros, electricistas, etc.) para gestionar solicitudes de servicio de forma estructurada, evitando la contratación informal por WhatsApp.

<details>
<summary>📖 Datos del proyecto</summary>

## Problema
La contratación de oficios independientes suele ser un caos informal: acuerdos por WhatsApp, poca trazabilidad y falta de organización.

## Solución (MVP)
Plataforma web tipo SPA que permite:
- Registro y login con 3 roles: **cliente**, **técnico** y **administrador**.
- Clientes: crear y gestionar solicitudes de servicio.
- Técnicos: aceptar o rechazar trabajos.
- Administrador: panel básico de gestión.
- Consumo de API REST.
- Despliegue en producción.

## Fuera de alcance
- Pagos integrados.
- Chat en tiempo real.

## Objetivo técnico
Demostrar una SPA completa con autenticación, manejo de múltiples roles, consumo de API REST y despliegue en producción, como evidencia de perfil junior full-stack.

## Documentación
Información detallada del proyecto en Confluence: [CUF - Wiki del proyecto](https://stefaniasanudo.atlassian.net/wiki/spaces/CUF/overview)
Inventario de componentes visuales (tablero Kanban): [COMPONENTES.md](./COMPONENTES.md)

</details>

<details>
<summary>👥 Equipo y roles</summary>

## Integrantes

| ROL | INTEGRANTE/S | CONTACTO |
|-----|--------------|----------|
| DATA ANALYST | Matías | matias.h.a.hernandez@gmail.com |
| BACKEND | Gonzalo, Julián | gonzalocarrillo877@gmail.com, falconjulian2000@gmail.com |
| FRONTEND | Erika | hevieri.dev@gmail.com |
| UX/UI | Carina | caricariluna@gmail.com |
| TESTER QA | Lorena | lorenadelgado.ba@gmail.com |
| PM | Stefanía | stefania.sanudo@gmail.com |

</details>

<details>
<summary>⚙️ Cómo configurar el proyecto</summary>

## Estructura

```
S2616-UrbanFix/
├── frontend/   # SPA React (Vite + pnpm)
├── backend/    # API REST
├── qa/         # Pruebas y QA
└── data/       # Datos del proyecto
```

## Requisitos
- [Node.js](https://nodejs.org/) (LTS)
- [pnpm](https://pnpm.io/) (`npm install -g pnpm`)

## Instalación

```bash
# Frontend
cd frontend
pnpm install
pnpm dev        # http://localhost:5173
```

### Variables de entorno (frontend)

Copiar `.env.example` a `.env`:

| Variable | Descripción |
|----------|-------------|
| `VITE_API_URL` | URL base de la API REST para axios. Default `http://localhost:3001/api` |
| `VITE_MOCK_AUTH` | `true` (default): auth simulada en el frontend. `false`: login/register/me reales contra la API |

## Arquitectura frontend (Semana 2)

### Estructura de carpetas

```
frontend/src/
├── components/
│   ├── auth/              # ProtectedRoute (guard por rol)
│   ├── layout/            # AppShell (C01), Navbar (C02), PagePlaceholder
│   └── ui/                # design system base (ver abajo)
├── constants/roles.js     # ROLES: cliente | tecnico | admin
├── context/               # estado global (AuthContext)
├── hooks/                 # useAuth, useToast
├── pages/                 # vistas completas por ruta (public, cliente, tecnico, admin)
├── routes/index.jsx       # definición de rutas (React Router)
└── services/              # acceso a datos (axios)
    ├── api.js             # instancia de axios + interceptores (token y 401)
    ├── client.js          # alias de api.js (compatibilidad con imports existentes)
    └── auth.js            # login, register, me (mock o API real)
```

### Sistema de diseño

Fuente: [data/05-sistema-de-diseno-base.md](./data/05-sistema-de-diseno-base.md) y
[data/06-inventario-de-componentes.md](./data/06-inventario-de-componentes.md) (UX/UI, KAN-13).

**Tokens** declarados en `@theme` de `src/index.css` (Tailwind v4) — cada `--color-*` genera sus
propias utilidades (`bg-primary`, `text-text-muted`, `border-border-input`…):

| Grupo | Tokens |
|-------|--------|
| Marca y neutros | `primary` `primary-hover` `accent` `text` `text-muted` `bg` `surface` `border` `border-input` |
| Semánticos | `success` `warning` `error` `info` |
| Radios | `rounded-field` (6 px) · `rounded-card` (12 px) · `rounded-full` (etiquetas) |
| Tipografía | Inter (Google Fonts en `index.html`), pesos 400/500/600/700 |
| Breakpoints | `xs: 360` (referencia móvil) · `md: 768` · `lg: 1024` · `xl: 1280` |

Reglas aplicadas: foco visible de 2 px con `primary` (`:focus-visible` global en `index.css`),
alto mínimo de 44 px en botones y controles (`min-h-11`), etiqueta visible en cada campo, y
borde de campos con `border-input` (nunca `border`, no alcanza el contraste).

### Design system base (`src/components/ui`)

| Componente | Props principales | Estados / novedades |
|------------|-------------------|---------------------|
| `Button` | `variant` (primary/secondary/danger/ghost), `loading`, `disabled` | loading (spinner + disabled), min 44 px, foco 2 px |
| `ButtonLink` | `to`, `variant` | link con aspecto de botón (no anida `Button` en `Link`) |
| `Input` | `label`, `error`, `required`, `type` | error (borde + mensaje), **mostrar/ocultar contraseña** |
| `Select` | `label`, `error`, `options` | error, min 44 px |
| `Textarea` | `label`, `error`, `maxLength` | error, **contador de caracteres** (warning al 90 %) |
| `Modal` | `open`, `onClose`, `title`, `footer` | cerrado (`null`), Esc cierra, radio 12 px |
| `Badge` | `tone` (slate/emerald/amber/rose) | — |
| `Spinner` | `size` (sm/md/lg) | — |
| `EmptyState` | `title`, `description`, `action` | empty state |
| `ErrorAlert` | `message`, `onRetry` | error state (+ reintentar) |
| `ToastProvider` + `useToast` | `show(message, type)` | info/success/error con tokens semánticos, auto-cierra a los 4s |
| `RoleBadge` | `role` | etiqueta capitalizada (Cliente / Técnico / Admin) |

### Componentes de dominio y constantes

| Archivo | Qué aporta |
|---------|-----------|
| `components/solicitudes/EstadoSolicitudBadge.jsx` | **D1**: etiqueta con ícono + texto para los 6 estados, con los pares texto/fondo del sistema de diseño |
| `constants/estadosSolicitud.js` | códigos y etiquetas de `PENDIENTE … CANCELADA` + `opcionesEstados()` |
| `constants/categorias.js` | las 8 categorías del backend + `etiquetaCategoria()` / `opcionesCategorias()` |
| `constants/mensajesVacios.js` | mensajes de estado vacío (§3 del inventario) para `EmptyState` |

### Estado: contexto global vs local

**Va en contexto global (`src/context`):**
- **Sesión/Auth** (`AuthContext`): usuario, rol, `status` (`idle`/`loading`/`error`/`authenticated`), `login`, `register`, `logout`. Necesario en el navbar, los guards de ruta y cualquier llamada autenticada.
- **Toasts** (`ToastProvider`): feedback global de éxito/error.
- *(Pendiente cuando haya backend: el carrito de trabajo/ofertas si el flujo lo requiere.)*

**Se queda en estado local (useState en la página/componente):**
- Formularios (login, registro, nueva solicitud): los campos se resetean al navegar.
- Listados y filtros de una vista concreta (solicitudes del cliente, disponibles del técnico).
- UI transitoria: modal abierto/cerrado, paginación de una tabla.

Regla general: si dos componentes no emparentados necesitan el mismo dato, va a contexto; si solo lo usa una pantalla, useState local.

### Decisiones tomadas

- **React Router con `createBrowserRouter`**: rutas protegidas por rol con `ProtectedRoute` + `Navigate`; placeholders por página hasta la maquetación de diseño.
- **AuthContext con mock** (`services/auth.js`): mientras el backend no esté listo, `VITE_MOCK_AUTH=true` simula login/register/me (misma API que la real). El token de la sesión se guarda en `localStorage` (`urbanfix.session`) y el interceptor de axios lo adjunta automáticamente.
- **Tailwind CSS v4** vía plugin `@tailwindcss/vite` (sin `tailwind.config.js`).
- **Tokens de UX/UI aplicados** (Semana 3): el sistema de diseño base vive en `src/index.css` como `@theme`; los componentes de `components/ui` ya usan los tokens, el foco de 2 px, los 44 px mínimos y la etiqueta visible. **Recibido también el inventario oficial de componentes** (`data/06-inventario-de-componentes.md`).
- **Pendiente de diseño (UX/UI)**: Home pública, dashboards, detalle de solicitud, tablas de admin (D5–D6), paginación (D9) y sidebar por rol (C03); ya aplicados los listados de cliente/técnico, `SolicitudCard`, `FilterChips`, el menú "Nombre ▾" del navbar y Nueva solicitud. Ver [data/07-pendientes-de-diseno.md](./data/07-pendientes-de-diseno.md) (el avance de implementación está en [COMPONENTES.md](./COMPONENTES.md)).

## Integración con la API (Semana 3)

El frontend se adaptó al contrato del backend (`backend/docs/API_CONTRACT.md`) **sin modificar nada de `backend/`**:

- **`services/api.js`**: instancia de axios con `baseURL` = `VITE_API_URL` (default `http://localhost:3001/api`).
  - *Request*: adjunta `Authorization: Bearer <token>` desde `localStorage` (`urbanfix.session`).
  - *Response*: ante un `401` limpia la sesión y redirige a `/login` (con guard para no entrar en bucle si ya estás en `/login`).
- **Envoltorio**: el backend responde `{ data: { usuario, token } }`; `services/auth.js` lo aplana a `{ token, user }` y mapea `usuario.rol` → `user.role` (minúsculas, igual que `ROLES`) y `usuario.nombre` → `user.name`. Por eso el resto de la app (`ProtectedRoute`, `RoleBadge`, `Home`) no cambió.
- **Errores**: `extractErrorMessage()` lee `error.response.data.error.message` y devuelve un `Error` con mensaje legible para el `ErrorAlert`.
- **Registro**: envía `{ email, password, nombre, celular?, rol }`, con contraseña mínima de 8 caracteres (zod en el backend). Solo `CLIENTE`/`TECNICO`, igual que el contrato.
- **Login**: el backend recibe sólo `{ email, password }`; la redirección post-login usa el `role` que devuelve la API. En modo mock sigue existiendo el selector de perfil para probar las rutas por rol.
- **Falta del lado del backend** (no tocado): levantar Postgres + `prisma migrate` + seed y publicar la API en `:3001` para poder probar el flujo real de punta a punta.


## Backend

API REST para registro y login, perfiles, solicitudes de servicio y administración
de usuarios. Autentica con JWT y aplica permisos para `CLIENTE`, `TECNICO` y
`ADMIN`; las solicitudes registran su historial de estados y rechazos individuales.

### Stack

| Componente | Tecnología |
|------------|------------|
| Runtime | Node.js, módulos ES; entorno de auditoría: Node 24 |
| HTTP | Express 5 |
| Persistencia | PostgreSQL, Prisma 7 y adaptador `@prisma/adapter-pg` |
| Autenticación | JWT (`jsonwebtoken`) y hash de contraseñas con `bcryptjs` |
| Validación | Zod 4 |
| Desarrollo | npm, nodemon y PostgreSQL en Docker |

### Instalación y ejecución

La [guía del backend](./backend/README.md) detalla la preparación de PostgreSQL,
instalación con `npm ci`, configuración a partir de
[`backend/.env.example`](./backend/.env.example), generación de Prisma,
migraciones, seed explícito y arranque con `npm run dev` desde `backend/`.

- API local: `http://localhost:3001/api`.
- Health local: `http://localhost:3001/health`. Comprueba que responde el proceso;
  no acredita por sí solo la conexión a PostgreSQL.
- Contrato de rutas, cuerpos y permisos: [API_CONTRACT.md](./backend/docs/API_CONTRACT.md).
- Plan de correcciones y dependencias: [BACKEND_PLAN.md](./backend/docs/BACKEND_PLAN.md).

**Estado de las migraciones:** la reparación de la
[issue #9](https://github.com/Talently-Lab/S2616-UrbanFix/issues/9) está integrada
en la rama de entrega `chore/backend-orchestration` con aprobación técnica de
QA. El usuario autorizó el push de esta entrega; no implica un merge a `main`. Ver la [guía de migraciones](./backend/docs/MIGRATION_GUIDE.md)
y el [reporte de validación](./backend/docs/qa/be-01-review-e826df7.md).
No ejecutar migraciones a ciegas sobre una base que ya contiene datos.
La suite general `npm test` de la
[issue #10](https://github.com/Talently-Lab/S2616-UrbanFix/issues/10) también está
integrada localmente con aprobación técnica de QA: ejecuta 71 casos HTTP, de configuración y concurrencia sobre
PostgreSQL aislado, con generación de Prisma, migraciones y seed de laboratorio.
Requiere Docker disponible o `TEST_DATABASE_URL` hacia un servidor exclusivo de
pruebas; no utiliza la conexión de desarrollo como fallback. Ver el
[reporte de QA](./backend/docs/qa/be-02-review-0829fc0.md).

La [issue #12](https://github.com/Talently-Lab/S2616-UrbanFix/issues/12) está
integrada localmente con [aprobación de QA](./backend/docs/qa/be-04-review-4a1afab.md):
las acciones concurrentes sobre solicitudes se serializan bajo bloqueo de fila,
con permisos y estado revalidados en la transacción. La entrega aún no está publicada.

### Variables de entorno

| Variable | Uso actual |
|----------|------------|
| `DATABASE_URL` | Conexión PostgreSQL utilizada por Prisma y el adaptador `pg` |
| `PORT` | Puerto HTTP; predeterminado `3001` |
| `JWT_SECRET` | Clave obligatoria de firma/verificación JWT, mínimo 32 caracteres; rechaza el placeholder del ejemplo |
| `JWT_EXPIRES_IN` | Duración con entero positivo y unidad `s`, `m`, `h`, `d`; predeterminado `7d` |
| `NODE_ENV` | `development`, `test` o `production`; predeterminado `development` |
| `CORS_ORIGINS` | Lista de orígenes HTTP(S) separados por comas; obligatoria y sin wildcard en producción |

La [issue #11](https://github.com/Talently-Lab/S2616-UrbanFix/issues/11) está
integrada localmente con [aprobación técnica de QA](./backend/docs/qa/be-03-review-4b1cc2d.md);
esta entrega aún no tiene autorización de push. La API valida la configuración
antes de escuchar. En desarrollo, CORS admite por defecto `localhost:5173` y
`127.0.0.1:5173`; en producción requiere una lista explícita. Las solicitudes sin
`Origin` siguen sujetas a autenticación y permisos. Prisma CLI y el seed no
requieren configuración JWT ni orígenes de producción.
El ejemplo de entorno no debe incluir credenciales reales ni prometer variables
que todavía no consume la aplicación.

### Cuentas de demostración

Disponibles después de ejecutar explícitamente `npm run db:seed` sobre una base
de desarrollo o laboratorio:

| Rol | Correo | Contraseña de demostración |
|-----|--------|----------------------------|
| Cliente | `juan@mail.com` | `MinimoOchoCaracteres` |
| Técnico | `carlos@mail.com` | `MinimoOchoCaracteres` |
| Administrador | `admin@mail.com` | `MinimoOchoCaracteres` |

Estas cuentas son datos de prueba; no ejecutar el seed en una base productiva.
El registro público crea clientes o técnicos; no crea administradores.

### Demo e integración

**No hay una URL de demo pública verificada.** La publicación de la API se
gestiona en la [issue #15](https://github.com/Talently-Lab/S2616-UrbanFix/issues/15).
Cuando exista un despliegue comprobado se agregará su URL y versión aquí.

El backend devuelve el estado actual y los datos del técnico mediante consultas
autenticadas de solicitudes. La actualización automática de una pantalla depende
del consumo de esas consultas por el frontend; no hay un canal push implementado.
Este ciclo de trabajo se limita al backend. **Todo push a GitHub requiere la
aprobación explícita del usuario**, después de presentar los commits y la evidencia.

</details>

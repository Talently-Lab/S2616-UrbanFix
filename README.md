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
│   ├── layout/            # PagePlaceholder
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
- **Pendiente de diseño (UX/UI)**: prototipo de pantallas públicas, layout por rol y los componentes de dominio D2–D10 (`SolicitudCard`, tablas de admin, etc.). Ver [data/07-pendientes-de-diseno.md](./data/07-pendientes-de-diseno.md) (el avance de implementación está en [COMPONENTES.md](./COMPONENTES.md)).

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

> ⚠️ Sección pendiente: el integrante de BACKEND deberá completar aquí la documentación del backend (tecnología, instalación, variables de entorno y cómo levantar la API).

</details>

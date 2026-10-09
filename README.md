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
| `VITE_API_URL` | URL base de la API REST para axios |
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
    ├── client.js          # instancia de axios + interceptor de token
    └── auth.js            # login, register, me (con mock)
```

### Design system base (`src/components/ui`)

| Componente | Props principales | Estados |
|------------|-------------------|---------|
| `Button` | `variant` (primary/secondary/danger/ghost), `loading`, `disabled` | loading (spinner + disabled) |
| `Input` / `Select` / `Textarea` | `label`, `error`, `required` | error (borde + mensaje) |
| `Modal` | `open`, `onClose`, `title`, `footer` | cerrado (`null`), Esc cierra |
| `Badge` | `tone` (slate/emerald/amber/rose) | — |
| `Spinner` | `size` (sm/md/lg) | — |
| `EmptyState` | `title`, `description`, `action` | empty state |
| `ErrorAlert` | `message`, `onRetry` | error state (+ reintentar) |
| `ToastProvider` + `useToast` | `show(message, type)` | info/success/error, auto-cierra a los 4s |

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
- **Pendiente de diseño (UX/UI)**: maquetado final de pantallas y componentes de dominio (`SolicitudCard`, tablas de admin, etc.). Ver [COMPONENTES.md](./COMPONENTES.md).


## Backend

> ⚠️ Sección pendiente: el integrante de BACKEND deberá completar aquí la documentación del backend (tecnología, instalación, variables de entorno y cómo levantar la API).

</details>

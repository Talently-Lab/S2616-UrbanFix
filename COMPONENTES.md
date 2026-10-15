# Tablero Kanban — Componentes visuales

> **Inventario oficial recibido (UX/UI).** Ver [data/06-inventario-de-componentes.md](./data/06-inventario-de-componentes.md)
> y los tokens en [data/05-sistema-de-diseno-base.md](./data/05-sistema-de-diseno-base.md) — ya aplicados en el código
> (`frontend/src/index.css` + `components/ui`). Este tablero se mantiene como kanban de avance.

Cómo usarlo: mover la tarjeta de columna al avanzar. Estados posibles: `Backlog` · `Maquetando` · `Listo`.

## Backlog

### 🧱 Layout
| # | Componente | Ruta / uso | Notas |
|---|-------------|-----------|-------|
| C03 | `SidebarNav` | `/cliente`, `/tecnico`, `/admin` | Menú lateral con secciones por perfil (pantalla de escritorio para admin) |
| C04 | `Footer` | públicas | Info básica, links |

### 👤 Cliente (`/cliente`)
| # | Componente | Ruta / uso | Notas |
|---|-------------|-----------|-------|
| C09 | `SolicitudCard` | `/cliente/solicitudes` | Card con estado, oficio y fecha |
| C10 | `SolicitudForm` | `/cliente/solicitudes/nueva` | Alta de solicitud (oficio, descripción, zona) |
| C11 | `SolicitudDetalle` | `/cliente/solicitudes/:id` | Detalle + timeline de estado |
| C12 | `EstadoSolicitudTag` | listados y detalle | **Implementado como D1** `EstadoSolicitudBadge` (ícono + texto + color por estado) |

### 🔧 Técnico (`/tecnico`)
| # | Componente | Ruta / uso | Notas |
|---|-------------|-----------|-------|
| C15 | `TrabajoDisponibleCard` | `/tecnico/disponibles` | Card con acciones Aceptar / Rechazar |
| C16 | `TrabajoCard` | `/tecnico/trabajos` | Card de trabajos aceptados/asignados |
| C17 | `TrabajoDetalle` | `/tecnico/trabajos/:id` | Detalle + cambiar estado |
| C18 | `PerfilTecnico` | `/tecnico/perfil` | Oficio, zona de cobertura, disponibilidad |

### 🛠️ Administrador (`/admin`)
| # | Componente | Ruta / uso | Notas |
|---|-------------|-----------|-------|
| C20 | `UsuarioTable` | `/admin/usuarios` | Tabla con acciones de rol |
| C21 | `SolicitudesTable` | `/admin/solicitudes` | Tabla global de solicitudes |
| C22 | `ReportePanel` | `/admin/reportes` | Reportes operativos |
| C23 | `ConfigForm` | `/admin/configuracion` | Ajustes generales |

## Maquetando

> Lógica/estructura creada, falta la estética final del diseño de UX/UI.

| # | Componente | Ruta / uso | Notas |
|---|-------------|-----------|-------|
| C01 | `AppShell` | todas las rutas protegidas | **Carcasa lista**: Navbar + `<Outlet/>` en `max-w-5xl`, envuelve las rutas desde `ProtectedRoute` (Semana 4); falta el wireframe final de layout por rol |
| C02 | `Navbar` | todas | **Carcasa lista**: logo, links según rol (§5 del inventario), nombre + `RoleBadge` + botón Salir; barra superior en los 3 roles, falta el wireframe final |
| C08 | `ClienteDashboard` | `/cliente` | **Carcasa lista**: saludo con `user.name` del contexto + `EmptyState` con mensaje §3 y CTA "Nueva solicitud"; falta el diseño final |
| C14 | `TecnicoDashboard` | `/tecnico` | **Carcasa lista**: saludo con contexto + `EmptyState` "Todavía no tenés trabajos." con CTA a Disponibles |
| C19 | `AdminDashboard` | `/admin` | **Carcasa lista**: saludo con contexto + `EmptyState` de indicadores; los KPIs (D10) esperan diseño |
| C05 | `LoginForm` | `/login` | Conectado a `POST /auth/login` (Semana 3): redirect según el rol que devuelve la API, selector de perfil sólo en modo mock; pendiente estilo del Figma |
| C06 | `RegisterForm` | `/registro` | Conectado a `POST /auth/register` (nombre, celular opcional, rol, password ≥ 8) con toast de éxito; pendiente estilo del Figma |
| C13 | `PerfilCliente` | `/cliente/perfil` | Placeholders de datos, falta formulario real |

## Listo

> Componentes genéricos del design system (`frontend/src/components/ui`) con los **tokens de UX/UI ya aplicados**
> (paleta, Inter, radios 6/12, foco 2 px, alto mínimo 44 px, etiqueta visible).

| # | Componente | Props | Estados |
|---|-------------|-------|---------|
| C07 | `RoleBadge` | `role` (cliente/tecnico/admin) | etiqueta capitalizada |
| C24 | `Button` / `ButtonLink` | `variant` (primary/secondary/danger/ghost), `loading`, `disabled`, `type` · `to` en ButtonLink | `loading`: spinner + deshabilitado |
| C25 | `Input` / `Select` / `Textarea` | `label`, `error`, `required`; `options` en Select; `maxLength` en Textarea | `error`: borde + mensaje; mostrar/ocultar contraseña; contador de caracteres |
| C26 | `Modal` | `open`, `onClose`, `title`, `footer` | cerrado (`null`); Esc y click fuera cierran |
| C27 | `Spinner` | `size` (sm/md/lg) | — |
| C28 | `EmptyState` | `title`, `description`, `action` | empty state (mensajes en `constants/mensajesVacios.js`) |
| C29 | `ErrorAlert` | `message`, `onRetry` | error state (+ botón reintentar) |
| C30 | `Toast` | `useToast().show(message, type)` | info/success/error; auto-cierra a los 4s |
| D1 | `EstadoSolicitudBadge` | `estado` (6 estados) | ícono + texto + color por estado |

### Estado global (no es componente visual, pero está listo)

- **`AuthContext`** (`src/context/AuthContext.jsx`): `user`, `role`, `status` (`idle`/`loading`/`error`/`authenticated`), `login`, `register`, `logout`. Persiste sesión en `localStorage` y la restaura al recargar. Mock activo hasta que el backend publique `/auth/*`.
- **`ProtectedRoute`** (`src/components/auth/ProtectedRoute.jsx`): guard por rol; muestra `Spinner` mientras restaura sesión.
- **Interceptor de axios** (`src/services/api.js`): adjunta el token a cada request y, ante un `401`, limpia la sesión y redirige a `/login` (`client.js` queda como alias).
- **Adaptador de contrato** (`src/services/auth.js`): aplana `{ data: { usuario, token } }` del backend a `{ token, user }` y mapea `rol` → `role`, `nombre` → `name`.

### Convenciones
- Componentes en `frontend/src/components/<dominio>/`, páginas (rutables) en `frontend/src/pages/<perfil>/`, design system en `frontend/src/components/ui/`.
- Rutas declaradas en `frontend/src/routes/index.jsx`; protección por rol con `ProtectedRoute` + `useAuth` (`frontend/src/hooks/useAuth.js`), roles en `frontend/src/constants/roles.js`.
- Acceso a datos en `frontend/src/services/` (axios).
- Estilos con Tailwind CSS v4.

---

## 🎨 Pendientes de diseño

> El detalle del seguimiento de diseño vive en [data/07-pendientes-de-diseno.md](./data/07-pendientes-de-diseno.md)
> (insumos UX/UI, qué está ✅ y qué falta: prototipo de pantallas públicas, layout por rol C01–C03 y D2–D10).

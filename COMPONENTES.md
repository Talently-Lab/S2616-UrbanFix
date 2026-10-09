# Tablero Kanban — Componentes visuales

> **⚠️ Listado provisorio.** Armado por Frontend a partir del MVP descrito en el README.
> Pendiente de reemplazar por el inventario oficial de UX/UI — [Wiki del proyecto](https://stefaniasanudo.atlassian.net/wiki/spaces/CUF/overview).
> Cuando llegue el diseño, se ajustan/eliminan tarjetas y se agregan las que falten.

Cómo usarlo: mover la tarjeta de columna al avanzar. Estados posibles: `Backlog` · `Maquetando` · `Listo`.

## Backlog

### 🧱 Layout
| # | Componente | Ruta / uso | Notas |
|---|-------------|-----------|-------|
| C01 | `AppShell` | todas las rutas protegidas | Layout con header, nav según rol y `<Outlet/>` |
| C02 | `Navbar` | todas | Logo + links de navegación + logout |
| C03 | `SidebarNav` | `/cliente`, `/tecnico`, `/admin` | Menú lateral con secciones por perfil |
| C04 | `Footer` | públicas | Info básica, links |

### 👤 Cliente (`/cliente`)
| # | Componente | Ruta / uso | Notas |
|---|-------------|-----------|-------|
| C08 | `ClienteDashboard` | `/cliente` | Resumen de solicitudes y estados |
| C09 | `SolicitudCard` | `/cliente/solicitudes` | Card con estado, oficio y fecha |
| C10 | `SolicitudForm` | `/cliente/solicitudes/nueva` | Alta de solicitud (oficio, descripción, zona) |
| C11 | `SolicitudDetalle` | `/cliente/solicitudes/:id` | Detalle + timeline de estado |
| C12 | `EstadoSolicitudTag` | listados y detalle | Se puede reusar `Badge` con mapeo de estados |

### 🔧 Técnico (`/tecnico`)
| # | Componente | Ruta / uso | Notas |
|---|-------------|-----------|-------|
| C14 | `TecnicoDashboard` | `/tecnico` | Métricas y trabajos del día |
| C15 | `TrabajoDisponibleCard` | `/tecnico/disponibles` | Card con acciones Aceptar / Rechazar |
| C16 | `TrabajoCard` | `/tecnico/trabajos` | Card de trabajos aceptados/asignados |
| C17 | `TrabajoDetalle` | `/tecnico/trabajos/:id` | Detalle + cambiar estado |
| C18 | `PerfilTecnico` | `/tecnico/perfil` | Oficio, zona de cobertura, disponibilidad |

### 🛠️ Administrador (`/admin`)
| # | Componente | Ruta / uso | Notas |
|---|-------------|-----------|-------|
| C19 | `AdminDashboard` | `/admin` | KPIs de la plataforma |
| C20 | `UsuarioTable` | `/admin/usuarios` | Tabla con acciones de rol |
| C21 | `SolicitudesTable` | `/admin/solicitudes` | Tabla global de solicitudes |
| C22 | `ReportePanel` | `/admin/reportes` | Reportes operativos |
| C23 | `ConfigForm` | `/admin/configuracion` | Ajustes generales |

## Maquetando

> Lógica/estructura creada, falta la estética final del diseño de UX/UI.

| # | Componente | Ruta / uso | Notas |
|---|-------------|-----------|-------|
| C05 | `LoginForm` | `/login` | Funcional con `useAuth` + `Input`/`Button`/`ErrorAlert`; pendiente estilo del Figma |
| C06 | `RegisterForm` | `/registro` | Funcional con `useAuth` + toast de éxito; pendiente estilo del Figma |
| C13 | `PerfilCliente` | `/cliente/perfil` | Placeholders de datos, falta formulario real |

## Listo

> Componentes genéricos del design system (`frontend/src/components/ui`). Estilo neutro con Tailwind: cuando llegue el Figma solo se ajustan tokens (colores/tipografía).

| # | Componente | Props | Estados |
|---|-------------|-------|---------|
| C07 | `RoleBadge` | `role` (cliente/tecnico/admin) | — |
| C24 | `Button` | `variant` (primary/secondary/danger/ghost), `loading`, `disabled`, `type` | `loading`: spinner + deshabilitado |
| C25 | `Input` / `Select` / `Textarea` | `label`, `error`, `required` | `error`: borde rose + mensaje |
| C26 | `Modal` | `open`, `onClose`, `title`, `footer` | cerrado (`null`); Esc y click fuera cierran |
| C27 | `Spinner` | `size` (sm/md/lg) | — |
| C28 | `EmptyState` | `title`, `description`, `action` | empty state |
| C29 | `ErrorAlert` | `message`, `onRetry` | error state (+ botón reintentar) |
| C30 | `Toast` | `useToast().show(message, type)` | info/success/error; auto-cierra a los 4s |

### Estado global (no es componente visual, pero está listo)

- **`AuthContext`** (`src/context/AuthContext.jsx`): `user`, `role`, `status` (`idle`/`loading`/`error`/`authenticated`), `login`, `register`, `logout`. Persiste sesión en `localStorage` y la restaura al recargar. Mock activo hasta que el backend publique `/auth/*`.
- **`ProtectedRoute`** (`src/components/auth/ProtectedRoute.jsx`): guard por rol; muestra `Spinner` mientras restaura sesión.
- **Interceptor de axios** (`src/services/client.js`): adjunta el token a cada request.

### Convenciones
- Componentes en `frontend/src/components/<dominio>/`, páginas (rutables) en `frontend/src/pages/<perfil>/`, design system en `frontend/src/components/ui/`.
- Rutas declaradas en `frontend/src/routes/index.jsx`; protección por rol con `ProtectedRoute` + `useAuth` (`frontend/src/hooks/useAuth.js`), roles en `frontend/src/constants/roles.js`.
- Acceso a datos en `frontend/src/services/` (axios).
- Estilos con Tailwind CSS v4.

---

## 🎨 Pendientes de diseño

Insumos del prototipo que faltan para avanzar con la maquetación. La lógica, los servicios y los componentes genéricos ya están listos; la maquetación arranca apenas estén estos insumos.

### Semana 1
- **Inventario oficial de componentes**: confirmar sobre el prototipo qué componentes existen realmente y sus variantes.

### Semana 2
- **Tokens de diseño**: paleta de colores, tipografía, espaciados y radii. Hoy el design system (`src/components/ui`) usa estilos neutros de Tailwind; sin tokens no se puede personalizar.
- **Prototipo de pantallas públicas**: maquetado real de Home, Login y Registro. Hoy están funcionales pero con estilo genérico.
- **Layout de pantallas protegidas**: dónde va el navbar/sidebar por rol (C01–C03).
- **Componentes de dominio con forma definida**: `SolicitudCard`, `TrabajoDisponibleCard`, tablas de admin (C20–C21) y contenido de los dashboards (C08, C14, C19) — sé qué datos muestran, no cómo los dispone el diseño.
- **Estados de solicitud y sus colores**: mapping visual (ej. `pendiente` = amber) para `EstadoSolicitudTag` (C12).

# Tablero Kanban — Componentes visuales

> **⚠️ Listado provisorio.** Armado por Frontend a partir del MVP descrito en el README.
> Pendiente de reemplazar por el inventario oficial de **UX/UI (Carina)** — [Wiki del proyecto](https://stefaniasanudo.atlassian.net/wiki/spaces/CUF/overview).
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

### 🔐 Autenticación
| # | Componente | Ruta / uso | Notas |
|---|-------------|-----------|-------|
| C05 | `LoginForm` | `/login` | Stub armado, falta maquetación final |
| C06 | `RegisterForm` | `/registro` | Alta de cliente o técnico |
| C07 | `RoleBadge` | headers, listados | Chip que muestra el rol del usuario |

### 👤 Cliente (`/cliente`)
| # | Componente | Ruta / uso | Notas |
|---|-------------|-----------|-------|
| C08 | `ClienteDashboard` | `/cliente` | Resumen de solicitudes y estados |
| C09 | `SolicitudCard` | `/cliente/solicitudes` | Card con estado, oficio y fecha |
| C10 | `SolicitudForm` | `/cliente/solicitudes/nueva` | Alta de solicitud (oficio, descripción, zona) |
| C11 | `SolicitudDetalle` | `/cliente/solicitudes/:id` | Detalle + timeline de estado |
| C12 | `EstadoSolicitudTag` | listados y detalle | Tag de color por estado |
| C13 | `PerfilCliente` | `/cliente/perfil` | Datos personales, editar |

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

### 🧩 UI compartida
| # | Componente | Ruta / uso | Notas |
|---|-------------|-----------|-------|
| C24 | `Button` | general | Variantes primario/secundario/peligro |
| C25 | `Input` / `Select` / `Textarea` | formularios | Con label, error y estado required |
| C26 | `Modal` | confirmaciones | Confirmar rechazo, eliminar, etc. |
| C27 | `Spinner` | cargas | Loading de requests |
| C28 | `EmptyState` | listados vacíos | Ilustración + CTA |
| C29 | `ErrorAlert` | errores de API | Mensaje de error reintentable |
| C30 | `Toast` | feedback | Éxito/error de acciones |

## Maquetando

_(sin tarjetas todavía)_

## Listo

_(sin tarjetas todavía)_

---

### Convenciones
- Componentes en `frontend/src/components/<dominio>/`, páginas (rutables) en `frontend/src/pages/<perfil>/`.
- Rutas declaradas en `frontend/src/routes/index.jsx`; protección por rol con `ProtectedRoute` + `useAuth` (`frontend/src/hooks/useAuth.js`), roles en `frontend/src/constants/roles.js`.
- Estilos con Tailwind CSS v4.
- Estado de autenticación provisorio en `AuthContext` (`localStorage`), se reemplaza por JWT cuando el backend esté listo.

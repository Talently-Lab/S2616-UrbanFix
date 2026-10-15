# UrbanFix · Inventario de componentes (insumo para Frontend)

**Ticket:** relacionado con KAN-2 y KAN-13 · **Semana 1** · **UX/UI**
**Autora:** Carina Luna (UX/UI)

Responde al pedido de Frontend ("Inventario oficial de componentes", `COMPONENTES.md` del
repositorio): qué componentes existen realmente según el diseño y qué variantes y estados tiene
cada uno.

**Estado:** primera versión basada en los flujos (02, 03, 04). Se ajusta cuando esté el
prototipo de Semana 2.

---

## 1. Componentes genéricos (ya existen en el código)

| Componente | Variantes | Estados | Observaciones de diseño |
|------------|-----------|---------|-------------------------|
| Button | primario · secundario · peligro · fantasma | normal · hover · foco · deshabilitado · cargando | Un solo primario por pantalla. Mínimo 44 px de alto. |
| Input | texto · email · contraseña · teléfono | normal · foco · error · deshabilitado | Con etiqueta visible. Contraseña con botón mostrar/ocultar. |
| Select | categoría de servicio | normal · foco · error | 8 categorías (ver sección 4). |
| Textarea | descripción de la solicitud | normal · foco · error | Con contador de caracteres. |
| Modal | confirmar · formulario | abierto · cerrado | Se usa para cancelar y rechazar (motivo obligatorio). |
| Toast | éxito · error · info | visible · cerrándose | Se cierra solo a los 4 segundos. |
| Spinner | pequeño · mediano · grande | — | — |
| EmptyState | cada lista tiene su mensaje | — | Ver sección 3. |
| ErrorAlert | con y sin reintentar | — | Para errores de carga de listas. |
| RoleBadge | cliente · técnico · admin | — | Para mostrar el rol del usuario. |

## 2. Componentes de dominio (a diseñar)

| # | Componente | Dónde se usa | Contenido | Estados |
|---|------------|--------------|-----------|---------|
| D1 | EstadoSolicitudBadge | Todas las listas y detalles | Etiqueta con ícono y texto, según los 6 estados (05-sistema-de-diseno-base.md) | Uno por estado |
| D2 | SolicitudCard | Cliente: mis solicitudes (móvil) | Título, categoría, fecha y estado | Con y sin técnico asignado |
| D3 | TrabajoDisponibleCard | Técnico: trabajos disponibles | Título, categoría, dirección, fecha y acciones Aceptar / Rechazar | Normal · procesando acción · ya tomado |
| D4 | TrabajoCard | Técnico: mis trabajos | Título, estado y botón del paso siguiente | Uno por estado |
| D5 | SolicitudTable | Admin: solicitudes | Columnas: título, categoría, cliente, técnico, estado, fecha | Con datos · vacío · cargando |
| D6 | HistorialTimeline | Detalle de solicitud (los 3 roles) | Cambio de estado, quién lo hizo, cuándo y motivo | Con y sin motivo |
| D7 | MotivoForm | Dentro de Modal | Campo de motivo obligatorio | Normal · error (vacío) · enviando |
| D8 | FiltroSolicitudes | Listados | Filtro por estado y por categoría | Sin filtro · con filtro |
| D9 | Paginacion | Listados | Anterior / siguiente y página actual | — |
| D10 | ResumenCard | Paneles | Un número y su título (por ejemplo, solicitudes pendientes) | Cargando · con dato |

## 3. Mensajes de estado vacío

| Pantalla | Mensaje sugerido | Acción |
|----------|------------------|--------|
| Cliente: mis solicitudes | "Todavía no creaste ninguna solicitud." | Nueva solicitud |
| Técnico: trabajos disponibles | "Por ahora no hay trabajos disponibles." | — |
| Técnico: mis trabajos | "Todavía no tenés trabajos." | Ir a trabajos disponibles |
| Admin: solicitudes | "No hay solicitudes con estos filtros." | Limpiar filtros |

## 4. Categorías de servicio

Según el backend: **Plomería · Electricidad · Gas · Carpintería · Pintura · Cerrajería ·
Albañilería · Otro.**

## 5. Estructura de layout por rol (pendiente de wireframes)

| Elemento | Cliente | Técnico | Admin |
|----------|---------|---------|-------|
| Navegación | Barra superior (móvil) | Barra superior (móvil) | Menú lateral (escritorio) |
| Secciones | Mis solicitudes · Nueva solicitud · Perfil | Disponibles · Mis trabajos · Perfil | Panel · Solicitudes · Usuarios |
| Dispositivo principal | Móvil | Móvil | Escritorio |

## 6. Orden sugerido de entrega a Frontend

| Prioridad | Qué | Cuándo |
|-----------|-----|--------|
| 1 | Este inventario y los tokens (05-sistema-de-diseno-base.md) | Semana 1 |
| 2 | Pantallas públicas: Home, Login y Registro | Semana 2 |
| 3 | Layout por rol (navegación) | Semana 2 |
| 4 | Componentes de dominio (D1 a D10) y pantallas de cada rol | Semana 2 |

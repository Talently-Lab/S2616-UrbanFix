# UrbanFix · Pendientes de diseño (seguimiento UX/UI)

> Archivo de seguimiento extraído de `COMPONENTES.md` para que todo el material de diseño viva en `data/`.
> Insumos originales de UX/UI (KAN-2 / KAN-13): [05-sistema-de-diseno-base.md](./05-sistema-de-diseno-base.md)
> y [06-inventario-de-componentes.md](./06-inventario-de-componentes.md).
> El tablero de avance de implementación sigue en [../COMPONENTES.md](../COMPONENTES.md).

Insumos de UX/UI. Lo resuelto queda marcado con ✅; lo que falta sigue bloqueando la maquetación.

## Semana 1 — ✅ entregado por UX/UI

- ✅ **Inventario oficial de componentes**: recibido → [06-inventario-de-componentes.md](./06-inventario-de-componentes.md) (variantes/estados de los genéricos, componentes de dominio D1–D10, mensajes vacíos, layout por rol y orden de entrega).

## Semana 2

- ✅ **Tokens de diseño**: sistema de diseño base recibido → [05-sistema-de-diseno-base.md](./05-sistema-de-diseno-base.md) y **ya aplicado** en `frontend/src/index.css` (`@theme`) + componentes de `components/ui`.
- ✅ **Estados de solicitud y sus colores**: mapping de los 6 estados aplicado en `EstadoSolicitudBadge` (D1).
- **Prototipo de pantallas públicas**: ✅ **Login y Registro maquetados con las capturas finales de UX/UI** (copy, toggle "Quiero", hints, errores por campo, banner con ícono y estados cargando → `frontend/src/pages/public/Login.jsx` y `Register.jsx`, carcasa en `components/auth/AuthLayout.jsx`); falta el diseño final de **Home**.
- **Layout de pantallas protegidas**: ✅ **navbar con menú "Nombre ▾" aplicado** (`frontend/src/components/layout/Navbar.jsx`: dropdown con nombre, email, `RoleBadge`, links por rol y Salir); sigue pendiente el sidebar de escritorio para admin (C03).
- **Componentes de dominio D2–D10**:
  - ✅ **D2 `SolicitudCard`** (`frontend/src/components/solicitudes/SolicitudCard.jsx`): categoría en mayúsculas + D1, título, meta "dirección · Creada el dd/mm" o "Publicada hace X min", variante con `acciones` (D3).
  - ✅ **D3 `TrabajoDisponibleCard`**: SolicitudCard con acciones Aceptar (`PATCH /solicitudes/:id/aceptar`) y Rechazar (D7: modal con motivo obligatorio → `PATCH /solicitudes/:id/rechazar`); solo `PENDIENTE` en `/tecnico/disponibles` con chips de categoría.
  - ✅ **D7 `MotivoForm`**: modal de rechazo en `frontend/src/pages/tecnico/index.jsx` (Textarea con error "Contá el motivo del rechazo." y estado enviando).
  - ✅ **D8 `FiltroSolicitudes`** (`frontend/src/components/ui/FilterChips.jsx`): chips full-width; estado en `/cliente/solicitudes`, categoría en `/tecnico/disponibles`, estado en `/tecnico/trabajos`.
  - ⬜ **D4 `TrabajoCard`** (mis trabajos): parcial — listado maquetado con chips, **falta el botón del paso siguiente por estado** y el diseño de detalle.
  - ⬜ **D5 `SolicitudTable`** (admin), **D6 `HistorialTimeline`** (detalle), **D9 `Paginacion`**, **D10 `ResumenCard`** (pendiente la forma visual).
- **Formularios de solicitud**: ✅ **Nueva solicitud maquetada** (`frontend/src/pages/cliente/CrearSolicitud.jsx`: orden Título → Categoría → Descripción → Dirección, hints, errores por campo con copy del diseño); ✅ listado **Mis solicitudes** (`/cliente/solicitudes`). Falta el diseño de Home pública, detalle de solicitud y perfiles.

## Dónde vive cada cosa

| Diseño | En el código |
|--------|-------------|
| Tokens (color, tipografía, radios, foco, breakpoints) | `frontend/src/index.css` (`@theme`) + `frontend/index.html` (Inter) |
| Componentes genéricos del design system | `frontend/src/components/ui/` |
| D1 `EstadoSolicitudBadge` (ícono + texto + color por estado) | `frontend/src/components/solicitudes/EstadoSolicitudBadge.jsx` |
| D2/D3/D4 `SolicitudCard` (con acciones de técnico y meta relativa) | `frontend/src/components/solicitudes/SolicitudCard.jsx` + `ListaSolicitudes.jsx` |
| D7 Motivo de rechazo (modal) | `frontend/src/pages/tecnico/index.jsx` |
| D8 `FiltroSolicitudes` (chips) | `frontend/src/components/ui/FilterChips.jsx` |
| Navbar con menú "Nombre ▾" | `frontend/src/components/layout/Navbar.jsx` |
| Listados y formularios de cliente/técnico | `frontend/src/pages/cliente/index.jsx`, `frontend/src/pages/cliente/CrearSolicitud.jsx`, `frontend/src/pages/tecnico/index.jsx` |
| Acciones del técnico (API + mock con rechazos por email) | `frontend/src/services/solicitudes.js` (`aceptar`, `rechazar`) |
| Estados de solicitud (códigos y etiquetas) | `frontend/src/constants/estadosSolicitud.js` |
| Categorías de servicio (8 del backend) | `frontend/src/constants/categorias.js` |
| Mensajes de estado vacío (§3) | `frontend/src/constants/mensajesVacios.js` |
| Avance de implementación (kanban C01–C30, D1) | [../COMPONENTES.md](../COMPONENTES.md) |

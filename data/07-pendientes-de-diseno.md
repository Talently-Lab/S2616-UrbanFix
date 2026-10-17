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
- **Layout de pantallas protegidas**: dónde va el navbar/sidebar por rol (C01–C03) — pendiente de wireframes (§5 del inventario).
- **Componentes de dominio D2–D10**: `SolicitudCard`, `TrabajoDisponibleCard`, tablas de admin, timeline, filtros, paginación y `ResumenCard` — sé qué datos muestran (§2 del inventario), falta la forma visual.

## Dónde vive cada cosa

| Diseño | En el código |
|--------|-------------|
| Tokens (color, tipografía, radios, foco, breakpoints) | `frontend/src/index.css` (`@theme`) + `frontend/index.html` (Inter) |
| Componentes genéricos del design system | `frontend/src/components/ui/` |
| D1 `EstadoSolicitudBadge` (ícono + texto + color por estado) | `frontend/src/components/solicitudes/EstadoSolicitudBadge.jsx` |
| Estados de solicitud (códigos y etiquetas) | `frontend/src/constants/estadosSolicitud.js` |
| Categorías de servicio (8 del backend) | `frontend/src/constants/categorias.js` |
| Mensajes de estado vacío (§3) | `frontend/src/constants/mensajesVacios.js` |
| Avance de implementación (kanban C01–C30, D1) | [../COMPONENTES.md](../COMPONENTES.md) |

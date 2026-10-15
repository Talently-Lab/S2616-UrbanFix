# data · Insumos de diseño

Documentación de diseño recibida de UX/UI, guardada tal cual para tenerla versionada en el repo.

| Archivo | Qué es | Ticket |
|---------|--------|--------|
| [05-sistema-de-diseno-base.md](./05-sistema-de-diseno-base.md) | Tokens de color, tipografía, espaciado, radios, sombras y reglas generales | KAN-13 · Semana 1 |
| [06-inventario-de-componentes.md](./06-inventario-de-componentes.md) | Inventario oficial de componentes: variantes, estados, componentes de dominio (D1–D10) y mensajes vacíos | KAN-2 / KAN-13 · Semana 1 |
| [07-pendientes-de-diseno.md](./07-pendientes-de-diseno.md) | Seguimiento de diseño: qué entregó UX/UI, qué está aplicado en código y qué sigue bloqueando la maquetación | seguimiento frontend |

Nombres alineados a los archivos referenciados por UX/UI (`05-…`, `06-…`).

Cómo se usa en el código:

- Tokens → `frontend/src/index.css` (`@theme` de Tailwind v4).
- Componentes genéricos → `frontend/src/components/ui/`.
- `EstadoSolicitudBadge` (D1) → `frontend/src/components/solicitudes/EstadoSolicitudBadge.jsx`.
- Categorías de servicio → `frontend/src/constants/categorias.js`.
- Estados de solicitud (códigos y etiquetas) → `frontend/src/constants/estadosSolicitud.js`.
- Mensajes de estado vacío → `frontend/src/constants/mensajesVacios.js`.

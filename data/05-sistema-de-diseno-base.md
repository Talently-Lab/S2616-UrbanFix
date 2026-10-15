# UrbanFix · Sistema de diseño base (propuesta)

**Ticket:** KAN-13 · **Semana 1** · **UX/UI**
**Autora:** Carina Luna (UX/UI)
**Herramienta:** Figma (plan gratuito) · **Stack del frontend:** React + Vite + Tailwind CSS v4

Propuesta para armar el archivo base en Figma. Los valores usan la paleta estándar de Tailwind
(nombres entre paréntesis) para que Frontend pueda aplicarlos sin crear colores nuevos.
Todos los contrastes de texto fueron calculados (WCAG 2.1, nivel AA, mínimo 4,5:1).

---

## 1. Color

### Marca y neutros

| Token | Valor | Tailwind | Uso | Contraste |
|-------|-------|----------|-----|-----------|
| color-primary | #1D4ED8 | blue-700 | Botón principal, links, foco | 6,70:1 con texto blanco |
| color-primary-hover | #1E40AF | blue-800 | Hover y presionado del principal | 8,72:1 con texto blanco |
| color-accent | #C2410C | orange-700 | Acento puntual (llamado a la acción secundario, íconos de oficio) | 5,18:1 con texto blanco |
| color-text | #111827 | gray-900 | Texto principal | 16,98:1 sobre #F9FAFB |
| color-text-muted | #4B5563 | gray-600 | Texto secundario y ayudas | 7,56:1 sobre blanco |
| color-bg | #F9FAFB | gray-50 | Fondo de la app | — |
| color-surface | #FFFFFF | white | Tarjetas, formularios, modales | — |
| color-border | #D1D5DB | gray-300 | Solo divisores decorativos | 1,47:1 (no usar en campos) |
| color-border-input | #6B7280 | gray-500 | Borde de campos y controles | 4,83:1 sobre blanco |

> **Importante:** el borde de los campos de formulario usa `color-border-input`, no `color-border`.
> El gris claro no alcanza el contraste mínimo de 3:1 para controles de interfaz.

### Semánticos

| Token | Valor | Tailwind | Uso | Contraste con texto blanco |
|-------|-------|----------|-----|----------------------------|
| color-success | #15803D | green-700 | Confirmaciones | 5,02:1 |
| color-warning | #B45309 | amber-700 | Advertencias | 5,02:1 |
| color-error | #B91C1C | red-700 | Errores y acciones destructivas | 6,47:1 |
| color-info | #0369A1 | sky-700 | Mensajes informativos | — |

### Estados de una solicitud

El mismo estado debe verse igual en todas las pantallas (cliente, técnico y admin).
Cada etiqueta lleva ícono y texto, **no solo color**.

| Estado | Etiqueta | Texto | Fondo | Contraste | Ícono sugerido |
|--------|----------|-------|-------|-----------|----------------|
| PENDIENTE | Pendiente | #92400E | #FEF3C7 | 6,37:1 | reloj |
| ACEPTADA | Aceptada | #1E40AF | #DBEAFE | 7,15:1 | check |
| EN_PROCESO | En proceso | #5B21B6 | #EDE9FE | 7,57:1 | llave inglesa |
| FINALIZADA | Finalizada | #166534 | #DCFCE7 | 6,49:1 | check doble |
| RECHAZADA | Rechazada | #991B1B | #FEE2E2 | 6,80:1 | cruz |
| CANCELADA | Cancelada | #374151 | #F3F4F6 | 9,37:1 | prohibido |

---

## 2. Tipografía

**Fuente:** Inter (gratuita en Google Fonts, disponible en Figma). Alternativa si hace falta: la fuente del sistema.

| Estilo | Tamaño / interlineado | Peso | Uso |
|--------|----------------------|------|-----|
| Título 1 | 30 / 36 | 700 | Título de pantalla |
| Título 2 | 24 / 32 | 700 | Secciones grandes |
| Título 3 | 20 / 28 | 600 | Tarjetas y modales |
| Cuerpo | 16 / 24 | 400 | Texto general (mínimo en móvil) |
| Cuerpo pequeño | 14 / 20 | 400 | Ayudas, datos secundarios |
| Etiqueta | 14 / 20 | 500 | Etiquetas de campos y botones |
| Texto mínimo | 12 / 16 | 500 | Etiquetas de estado, metadatos |

---

## 3. Espaciado, radios, sombras y puntos de corte

- **Espaciado** (múltiplos de 4): 4 · 8 · 12 · 16 · 24 · 32 · 48 · 64
- **Radios:** 6 px (campos y botones) · 12 px (tarjetas y modales) · 9999 px (etiquetas de estado)
- **Sombras:** sm (tarjetas) · md (modales y menús)
- **Puntos de corte:** 360 (móvil de referencia) · 768 (tablet) · 1024 (escritorio) · 1280 (escritorio ancho)
- **Grilla:** 4 columnas en móvil · 8 en tablet · 12 en escritorio, con 16 px de margen lateral en móvil

---

## 4. Reglas generales

1. Una acción principal por pantalla (botón relleno con `color-primary`).
2. Tamaño táctil mínimo de 44 × 44 px en botones y controles.
3. Foco visible en todos los elementos interactivos (anillo de 2 px con `color-primary`).
4. Etiqueta visible en cada campo (no usar solo el placeholder) y mensaje de error debajo del campo.
5. El estado nunca se comunica solo con color.
6. Textos en español neutro y simple, sin jerga técnica.

---

## 5. Componentes base a diseñar (variantes y estados)

Coinciden con los que Frontend ya tiene en `components/ui`, para que el diseño los reemplace sin
rehacer código. Detalle en [06-inventario-de-componentes.md](./06-inventario-de-componentes.md).

`Button` · `Input` / `Select` / `Textarea` · `Badge` (estado de solicitud) · `Modal` · `Toast` ·
`Spinner` · `EmptyState` · `ErrorAlert`

---

## 6. Cómo armarlo en Figma

- **Página 00** · Portada con índice y estado.
- **Página 01** · Fundamentos: estilos de color, tipografía, espaciados y efectos como estilos/variables.
- **Página 02** · Componentes: cada componente con todas sus variantes y estados.
- **Página 03** · Flujos: user flows (02, 03 y 04).
- **Páginas posteriores (Semana 2):** wireframes de baja y alta fidelidad y prototipo.

> El plan gratuito de Figma tiene límite de páginas por archivo: si hace falta, separar flujos y
> prototipo en otro archivo.

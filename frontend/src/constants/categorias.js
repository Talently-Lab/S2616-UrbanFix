// Categorías de servicio: enum del backend (backend/docs/API_CONTRACT.md §2)
// y §4 del inventario de componentes de UX/UI.

export const CATEGORIAS = [
  'PLOMERIA',
  'ELECTRICIDAD',
  'GAS',
  'CARPINTERIA',
  'PINTURA',
  'CERRAJERIA',
  'ALBANILERIA',
  'OTRO',
]

const ETIQUETAS = {
  PLOMERIA: 'Plomería',
  ELECTRICIDAD: 'Electricidad',
  GAS: 'Gas',
  CARPINTERIA: 'Carpintería',
  PINTURA: 'Pintura',
  CERRAJERIA: 'Cerrajería',
  ALBANILERIA: 'Albañilería',
  OTRO: 'Otro',
}

export function etiquetaCategoria(categoria) {
  return ETIQUETAS[categoria] ?? categoria
}

export function opcionesCategorias() {
  return CATEGORIAS.map((categoria) => ({
    value: categoria,
    label: ETIQUETAS[categoria] ?? categoria,
  }))
}

import { z } from 'zod';

export const categoriaEnum = z.enum([
  'PLOMERIA', 'ELECTRICIDAD', 'GAS', 'CARPINTERIA',
  'PINTURA', 'CERRAJERIA', 'ALBANILERIA', 'OTRO'
]);

export const CATEGORIAS = [...categoriaEnum.options];

export const estadoEnum = z.enum([
  'PENDIENTE', 'ACEPTADA', 'RECHAZADA', 'EN_PROCESO', 'FINALIZADA', 'CANCELADA'
]);

export const createSolicitudSchema = z.object({
  titulo: z.string().min(1, 'El título es obligatorio'),
  descripcion: z.string().min(1, 'La descripción es obligatoria'),
  categoria: categoriaEnum,
  direccion: z.string().min(1, 'La dirección es obligatoria')
});

export const updateSolicitudSchema = createSolicitudSchema.partial();

export const motivoSchema = z.object({
  motivo: z.string().min(1, 'El motivo es obligatorio')
});

export const listSolicitudesQuerySchema = z.object({
  estado: estadoEnum.optional(),
  categoria: categoriaEnum.optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional()
});

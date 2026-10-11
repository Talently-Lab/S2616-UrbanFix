import { z } from 'zod';

export const listUsuariosQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional()
});

export const updateUsuarioAdminSchema = z.object({
  nombre: z.string().min(1, 'El nombre no puede estar vacío').optional(),
  celular: z.string().optional().nullable(),
  rol: z.enum(['CLIENTE', 'TECNICO', 'ADMIN']).optional()
}).refine(
  (data) => Object.keys(data).length > 0,
  { message: 'Debes indicar al menos un campo a actualizar' }
);
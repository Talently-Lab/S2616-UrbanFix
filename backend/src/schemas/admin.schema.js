import { z } from 'zod';

/**
 * Esquema de validación para el listado paginado de usuarios del panel admin.
 *
 * `page` y `limit` son opcionales; `limit` se limita a 100 para acotar la carga.
 *
 * @type {import('zod').ZodTypeAny}
 */
export const listUsuariosQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional()
});

/**
 * Esquema de validación para la actualización administrativa de un usuario.
 *
 * Todos los campos son opcionales, pero debe enviarse al menos uno. El rol solo
 * admite los valores del enum `Rol`.
 *
 * @type {import('zod').ZodTypeAny}
 */
export const updateUsuarioAdminSchema = z.object({
  nombre: z.string().min(1, 'El nombre no puede estar vacío').optional(),
  celular: z.string().optional().nullable(),
  rol: z.enum(['CLIENTE', 'TECNICO', 'ADMIN']).optional()
}).refine(
  (data) => Object.keys(data).length > 0,
  { message: 'Debes indicar al menos un campo a actualizar' }
);

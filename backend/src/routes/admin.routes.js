import { Router } from 'express';
import * as ctrl from '../controllers/admin.controller.js';
import { authenticate, authorize } from '../middlewares/auth.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import { listUsuariosQuerySchema, updateUsuarioAdminSchema } from '../schemas/admin.schema.js';

/**
 * Router de administración montado en `/api/admin`.
 *
 * Todas las rutas de este módulo son privadas: requieren un JWT válido en el
 * header `Authorization: Bearer <token>` y un usuario con rol `ADMIN`. La
 * protección se aplica de forma global antes de declarar los endpoints para
 * evitar que se agreguen rutas administrativas sin autenticación.
 *
 * @module routes/admin
 */
const router = Router();

// 1) Verifica el JWT y carga el usuario autenticado en `req.user`.
router.use(authenticate);

// 2) Restringe todo el router exclusivamente al rol ADMIN.
router.use(authorize(['ADMIN']));

/**
 * Lista usuarios de la plataforma con paginación.
 *
 * @route GET /api/admin/usuarios
 * @access Privado (ADMIN)
 * @param {import('express').Request} req - Query opcional `page` y `limit`.
 * @param {import('express').Response} res - `{ data: Usuario[], meta: {...} }`.
 * @param {import('express').NextFunction} next - Propaga errores.
 */
router.get('/usuarios', validate(listUsuariosQuerySchema, 'query'), ctrl.list);

/**
 * Obtiene el detalle de un usuario por su UUID.
 *
 * @route GET /api/admin/usuarios/:id
 * @access Privado (ADMIN)
 * @param {import('express').Request} req - `req.params.id` con el UUID.
 * @param {import('express').Response} res - `{ data: Usuario }`.
 * @param {import('express').NextFunction} next - Propaga errores (404 si no existe).
 */
router.get('/usuarios/:id', ctrl.getById);

/**
 * Actualiza datos administrativos de un usuario (nombre, celular o rol).
 *
 * @route PATCH /api/admin/usuarios/:id
 * @access Privado (ADMIN)
 * @param {import('express').Request} req - `req.params.id` y body parcial.
 * @param {import('express').Response} res - `{ data: Usuario }` actualizado.
 * @param {import('express').NextFunction} next - Propaga errores de validación o 404.
 */
router.patch('/usuarios/:id', validate(updateUsuarioAdminSchema), ctrl.update);

export default router;

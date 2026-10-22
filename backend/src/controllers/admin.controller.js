import * as usuarioService from '../services/usuario.service.js';

/**
 * Lista usuarios para el panel de administración.
 *
 * Delega en `usuarioService.listUsuarios` la paginación y el ordenamiento, y
 * responde con el contrato `{ data, meta }`.
 *
 * @param {import('express').Request} req - Petición con `req.query.page` y
 *   `req.query.limit` (ya validados por `listUsuariosQuerySchema`).
 * @param {import('express').Response} res - Respuesta `200` con la lista paginada.
 * @param {import('express').NextFunction} next - Propaga errores al middleware global.
 * @returns {Promise<void>}
 */
export const list = async (req, res, next) => {
  try {
    const result = await usuarioService.listUsuarios(req.query);
    res.status(200).json(result);
  } catch (err) { next(err); }
};

/**
 * Devuelve el detalle de un usuario por su UUID.
 *
 * @param {import('express').Request} req - Petición con `req.params.id`.
 * @param {import('express').Response} res - Respuesta `200` con `{ data: Usuario }`.
 * @param {import('express').NextFunction} next - Propaga errores (404 si no existe).
 * @returns {Promise<void>}
 */
export const getById = async (req, res, next) => {
  try {
    const usuario = await usuarioService.getUserById(req.params.id);
    res.status(200).json({ data: usuario });
  } catch (err) { next(err); }
};

/**
 * Actualiza los datos administrativos de un usuario.
 *
 * Permite cambiar `nombre`, `celular` y `rol`. El body ya fue validado por
 * `updateUsuarioAdminSchema`, que exige al menos un campo.
 *
 * @param {import('express').Request} req - Petición con `req.params.id` y body parcial.
 * @param {import('express').Response} res - Respuesta `200` con `{ data: Usuario }`.
 * @param {import('express').NextFunction} next - Propaga errores de validación o 404.
 * @returns {Promise<void>}
 */
export const update = async (req, res, next) => {
  try {
    const usuario = await usuarioService.updateUser(req.params.id, req.body);
    res.status(200).json({ data: usuario });
  } catch (err) { next(err); }
};

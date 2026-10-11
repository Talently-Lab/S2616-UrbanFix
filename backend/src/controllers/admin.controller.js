import * as usuarioService from '../services/usuario.service.js';

export const list = async (req, res, next) => {
  try {
    const result = await usuarioService.listUsuarios(req.query);
    res.status(200).json(result);
  } catch (err) { next(err); }
};

export const getById = async (req, res, next) => {
  try {
    const usuario = await usuarioService.getUserById(req.params.id);
    res.status(200).json({ data: usuario });
  } catch (err) { next(err); }
};

export const update = async (req, res, next) => {
  try {
    const usuario = await usuarioService.updateUser(req.params.id, req.body);
    res.status(200).json({ data: usuario });
  } catch (err) { next(err); }
};
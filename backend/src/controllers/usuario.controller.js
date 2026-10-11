import * as usuarioService from '../services/usuario.service.js';

export const getMe = (req, res) => {
  res.status(200).json({ data: req.user });
};

export const updateMe = async (req, res, next) => {
  try {
    const usuario = await usuarioService.updateProfile(req.user.id, req.body);
    res.status(200).json({ data: usuario });
  } catch (err) { next(err); }
};


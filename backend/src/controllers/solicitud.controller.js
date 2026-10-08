import * as solicitudService from '../services/solicitud.service.js';

export const create = async (req, res, next) => {
  try {
    const solicitud = await solicitudService.createSolicitud(req.user.id, req.body);
    res.status(201).json({ data: solicitud });
  } catch (err) { next(err); }
};

export const list = async (req, res, next) => {
  try {
    const result = await solicitudService.listSolicitudes(req.user, req.query);
    res.status(200).json(result);
  } catch (err) { next(err); }
};

export const getById = async (req, res, next) => {
  try {
    const solicitud = await solicitudService.getSolicitudById(req.params.id, req.user);
    res.status(200).json({ data: solicitud });
  } catch (err) { next(err); }
};

export const update = async (req, res, next) => {
  try {
    const solicitud = await solicitudService.updateSolicitud(req.params.id, req.user.id, req.body);
    res.status(200).json({ data: solicitud });
  } catch (err) { next(err); }
};

export const aceptar = async (req, res, next) => {
  try {
    const solicitud = await solicitudService.cambiarEstado({
      id: req.params.id,
      user: req.user,
      estadoEsperado: 'PENDIENTE',
      nuevoEstado: 'ACEPTADA',
      accion: 'aceptar',
      datosActualizar: { tecnicoId: req.user.id, fechaAceptacion: new Date() }
    });
    res.status(200).json({ data: solicitud });
  } catch (err) { next(err); }
};

export const rechazar = async (req, res, next) => {
  try {
    const solicitud = await solicitudService.cambiarEstado({
      id: req.params.id,
      user: req.user,
      estadoEsperado: 'PENDIENTE',
      nuevoEstado: 'RECHAZADA',
      motivo: req.body.motivo,
      accion: 'rechazar'
    });
    res.status(200).json({ data: solicitud });
  } catch (err) { next(err); }
};

export const iniciar = async (req, res, next) => {
  try {
    const prev = await solicitudService.getSolicitudById(req.params.id, req.user);
    if (prev.tecnicoId !== req.user.id) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'No eres el técnico asignado' } });
    }
    const solicitud = await solicitudService.cambiarEstado({
      id: req.params.id,
      user: req.user,
      estadoEsperado: 'ACEPTADA',
      nuevoEstado: 'EN_PROCESO',
      accion: 'iniciar',
      datosActualizar: { fechaInicio: new Date() }
    });
    res.status(200).json({ data: solicitud });
  } catch (err) { next(err); }
};

export const finalizar = async (req, res, next) => {
  try {
    const prev = await solicitudService.getSolicitudById(req.params.id, req.user);
    if (prev.tecnicoId !== req.user.id) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'No eres el técnico asignado' } });
    }
    const solicitud = await solicitudService.cambiarEstado({
      id: req.params.id,
      user: req.user,
      estadoEsperado: 'EN_PROCESO',
      nuevoEstado: 'FINALIZADA',
      accion: 'finalizar',
      datosActualizar: { fechaFinalizacion: new Date() }
    });
    res.status(200).json({ data: solicitud });
  } catch (err) { next(err); }
};

export const cancelar = async (req, res, next) => {
  try {
    const prev = await solicitudService.getSolicitudById(req.params.id, req.user);
    if (req.user.rol !== 'ADMIN' && prev.clienteId !== req.user.id) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Solo el cliente o un administrador pueden cancelar' } });
    }
    const solicitud = await solicitudService.cambiarEstado({
      id: req.params.id,
      user: req.user,
      estadoEsperado: ['PENDIENTE', 'ACEPTADA'],
      nuevoEstado: 'CANCELADA',
      accion: 'cancelar',
      datosActualizar: { fechaCancelacion: new Date(), motivoCancelacion: req.body.motivo },
      motivo: req.body.motivo
    });
    res.status(200).json({ data: solicitud });
  } catch (err) { next(err); }
};

export const getHistorial = async (req, res, next) => {
  try {
    const historial = await solicitudService.getHistorial(req.params.id, req.user);
    res.status(200).json({ data: historial });
  } catch (err) { next(err); }
};
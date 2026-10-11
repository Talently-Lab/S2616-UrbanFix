import prisma from '../config/prisma.js';

const selectSolicitud = {
  id: true,
  titulo: true,
  descripcion: true,
  categoria: true,
  direccion: true,
  estado: true,
  clienteId: true,
  tecnicoId: true,
  cliente: { select: { id: true, nombre: true, celular: true } },
  tecnico: { select: { id: true, nombre: true, celular: true } },
  fechaCreacion: true,
  fechaAceptacion: true,
  fechaInicio: true,
  fechaFinalizacion: true,
  fechaCancelacion: true,
  motivoCancelacion: true,
  fechaActualizacion: true
};

export const createSolicitud = async (clienteId, data) => {
  return await prisma.$transaction(async (tx) => {
    const solicitud = await tx.solicitud.create({
      data: {
        ...data,
        clienteId,
        estado: 'PENDIENTE'
      },
      select: selectSolicitud
    });

    await tx.historialEstado.create({
      data: {
        solicitudId: solicitud.id,
        estadoAnterior: null,
        estadoNuevo: 'PENDIENTE',
        cambiadoPorId: clienteId,
        motivo: null
      }
    });

    return solicitud;
  });
};

export const listSolicitudes = async (user, query) => {
  const page = parseInt(query.page) || 1;
  const limit = Math.min(parseInt(query.limit) || 20, 100);
  const skip = (page - 1) * limit;

  let where = {};
  if (query.estado) where.estado = query.estado;
  if (query.categoria) where.categoria = query.categoria;

  if (user.rol === 'CLIENTE') {
    where.clienteId = user.id;
  } else if (user.rol === 'TECNICO') {
    where = {
      ...where,
      OR: [{ estado: 'PENDIENTE' }, { tecnicoId: user.id }]
    };
  }

  const [data, total] = await Promise.all([
    prisma.solicitud.findMany({
      where,
      skip,
      take: limit,
      orderBy: { fechaCreacion: 'desc' },
      select: selectSolicitud
    }),
    prisma.solicitud.count({ where })
  ]);

  return { data, meta: { page, limit, total } };
};

export const getSolicitudById = async (id, user) => {
  const solicitud = await prisma.solicitud.findUnique({
    where: { id },
    select: selectSolicitud
  });

  if (!solicitud) {
    const error = new Error('La solicitud no existe');
    error.status = 404;
    error.code = 'NOT_FOUND';
    throw error;
  }

  const isOwner = solicitud.clienteId === user.id;
  const isAssignedTech = solicitud.tecnicoId === user.id;
  const isPendingTech = user.rol === 'TECNICO' && solicitud.estado === 'PENDIENTE';
  const isAdmin = user.rol === 'ADMIN';

  if (!isOwner && !isAssignedTech && !isPendingTech && !isAdmin) {
    const error = new Error('No tienes permisos para ver esta solicitud');
    error.status = 403;
    error.code = 'FORBIDDEN';
    throw error;
  }

  return solicitud;
};

export const updateSolicitud = async (id, clienteId, data) => {
  const solicitud = await prisma.solicitud.findUnique({ where: { id } });
  if (!solicitud) {
    const error = new Error('La solicitud no existe');
    error.status = 404;
    error.code = 'NOT_FOUND';
    throw error;
  }

  if (solicitud.clienteId !== clienteId) {
    const error = new Error('No eres el dueño de esta solicitud');
    error.status = 403;
    error.code = 'FORBIDDEN';
    throw error;
  }

  if (solicitud.estado !== 'PENDIENTE') {
    const error = new Error('Solo se pueden editar solicitudes en estado PENDIENTE');
    error.status = 409;
    error.code = 'CONFLICT';
    throw error;
  }

  return await prisma.solicitud.update({
    where: { id },
    data,
    select: selectSolicitud
  });
};

export const cambiarEstado = async ({ id, user, estadoEsperado, nuevoEstado, datosActualizar = {}, motivo = null, accion = 'cambiar el estado' }) => {
  return await prisma.$transaction(async (tx) => {
    const solicitud = await tx.solicitud.findUnique({ where: { id } });
    if (!solicitud) {
      const error = new Error('La solicitud no existe');
      error.status = 404;
      error.code = 'NOT_FOUND';
      throw error;
    }

    const estadosValidos = Array.isArray(estadoEsperado) ? estadoEsperado : [estadoEsperado];
    if (!estadosValidos.includes(solicitud.estado)) {
      const error = new Error(`No se puede ${accion} una solicitud en estado ${solicitud.estado}`);
      error.status = 409;
      error.code = 'CONFLICT';
      throw error;
    }

    const updated = await tx.solicitud.update({
      where: { id },
      data: {
        estado: nuevoEstado,
        ...datosActualizar
      },
      select: selectSolicitud
    });

    await tx.historialEstado.create({
      data: {
        solicitudId: id,
        estadoAnterior: solicitud.estado,
        estadoNuevo: nuevoEstado,
        cambiadoPorId: user.id,
        motivo
      }
    });

    return updated;
  });
};

export const getHistorial = async (solicitudId, user) => {
  await getSolicitudById(solicitudId, user); // Valida existencia y permisos

  const list = await prisma.historialEstado.findMany({
    where: { solicitudId },
    orderBy: { fechaCambio: 'asc' },
    select: {
      id: true,
      solicitudId: true,
      estadoAnterior: true,
      estadoNuevo: true,
      cambiadoPor: { select: { id: true, nombre: true, rol: true } },
      motivo: true,
      fechaCambio: true
    }
  });

  return list;
};
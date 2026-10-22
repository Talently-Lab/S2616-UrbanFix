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
    const solicitud = await tx.solicitudServicio.create({
      data: {
        ...data,
        clienteId,
        estado: 'PENDIENTE'
      },
      select: selectSolicitud
    });

    await tx.historialEstadoSolicitud.create({
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
  if (query.categoria) where.categoria = query.categoria;

  if (user.rol === 'CLIENTE') {
    where.clienteId = user.id;
    if (query.estado) where.estado = query.estado;
  } else if (user.rol === 'TECNICO') {
    if (query.estado) {
      if (query.estado === 'PENDIENTE') {
        where = {
          ...where,
          estado: 'PENDIENTE',
          rechazos: { none: { tecnicoId: user.id } }
        };
      } else {
        where = {
          ...where,
          estado: query.estado,
          tecnicoId: user.id
        };
      }
    } else {
      where = {
        ...where,
        OR: [
          {
            estado: 'PENDIENTE',
            rechazos: { none: { tecnicoId: user.id } }
          },
          { tecnicoId: user.id }
        ]
      };
    }
  } else if (user.rol === 'ADMIN') {
    if (query.estado) where.estado = query.estado;
  }

  const [data, total] = await Promise.all([
    prisma.solicitudServicio.findMany({
      where,
      skip,
      take: limit,
      orderBy: { fechaCreacion: 'desc' },
      select: selectSolicitud
    }),
    prisma.solicitudServicio.count({ where })
  ]);

  return { data, meta: { page, limit, total } };
};

export const getSolicitudById = async (id, user) => {
  const solicitud = await prisma.solicitudServicio.findUnique({
    where: { id },
    select: selectSolicitud
  });

  if (!solicitud) {
    const error = new Error('La solicitud no existe');
    error.status = 404;
    error.code = 'NOT_FOUND';
    throw error;
  }

  let hasRejected = false;
  if (user.rol === 'TECNICO') {
    const rechazo = await prisma.rechazoSolicitud.findUnique({
      where: {
        solicitudId_tecnicoId: {
          solicitudId: id,
          tecnicoId: user.id
        }
      }
    });
    hasRejected = !!rechazo;
  }

  const isOwner = solicitud.clienteId === user.id;
  const isAssignedTech = solicitud.tecnicoId === user.id;
  const isPendingTech = user.rol === 'TECNICO' && solicitud.estado === 'PENDIENTE' && !hasRejected;
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
  const solicitud = await prisma.solicitudServicio.findUnique({ where: { id } });
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

  return await prisma.solicitudServicio.update({
    where: { id },
    data,
    select: selectSolicitud
  });
};

export const aceptarSolicitud = async (id, user) => {
  return await prisma.$transaction(async (tx) => {
    const solicitud = await tx.solicitudServicio.findUnique({ where: { id } });
    if (!solicitud) {
      const error = new Error('La solicitud no existe');
      error.status = 404;
      error.code = 'NOT_FOUND';
      throw error;
    }

    if (solicitud.estado !== 'PENDIENTE') {
      const error = new Error(`No se puede aceptar una solicitud en estado ${solicitud.estado}`);
      error.status = 409;
      error.code = 'CONFLICT';
      throw error;
    }

    const rechazoPrevio = await tx.rechazoSolicitud.findUnique({
      where: {
        solicitudId_tecnicoId: {
          solicitudId: id,
          tecnicoId: user.id
        }
      }
    });

    if (rechazoPrevio) {
      const error = new Error('No puedes aceptar una solicitud que has rechazado previamente');
      error.status = 409;
      error.code = 'CONFLICT';
      throw error;
    }

    const updated = await tx.solicitudServicio.update({
      where: { id },
      data: {
        estado: 'ACEPTADA',
        tecnicoId: user.id,
        fechaAceptacion: new Date()
      },
      select: selectSolicitud
    });

    await tx.historialEstadoSolicitud.create({
      data: {
        solicitudId: id,
        estadoAnterior: 'PENDIENTE',
        estadoNuevo: 'ACEPTADA',
        cambiadoPorId: user.id,
        motivo: null
      }
    });

    return updated;
  });
};

/**
 * Rechaza una solicitud de la bolsa o libera un trabajo ya asignado al técnico.
 *
 * Comportamiento según el estado actual de la solicitud:
 * - `PENDIENTE`: registra un `RechazoSolicitud` para el técnico, agrega una fila
 *   de historial con `accion: 'RECHAZO'` y mantiene la solicitud en `PENDIENTE`
 *   para que otros técnicos puedan tomarla.
 * - `ACEPTADA`: solo el técnico asignado puede liberarla. La solicitud vuelve a
 *   `PENDIENTE`, se remueve `tecnicoId`, se limpia `fechaAceptacion` y se
 *   registra el historial con `accion: 'LIBERACION'`.
 *
 * Ambos caminos se ejecutan en una transacción para mantener consistentes la
 * solicitud, el historial y (cuando aplica) la tabla de rechazos.
 *
 * @param {string} id - UUID de la solicitud.
 * @param {{ id: string, rol: string }} user - Técnico autenticado que ejecuta la acción.
 * @param {string} motivo - Motivo obligatorio del rechazo o liberación.
 * @returns {Promise<object>} Solicitud actualizada con el select público.
 * @throws {Error} `404 NOT_FOUND` si la solicitud no existe.
 * @throws {Error} `403 FORBIDDEN` si la solicitud no está asignada al técnico.
 * @throws {Error} `409 CONFLICT` si el estado no permite rechazar/liberar o si
 *   el técnico ya la había rechazado previamente.
 */
export const rechazarSolicitud = async (id, user, motivo) => {
  return await prisma.$transaction(async (tx) => {
    const solicitud = await tx.solicitudServicio.findUnique({ where: { id } });
    if (!solicitud) {
      const error = new Error('La solicitud no existe');
      error.status = 404;
      error.code = 'NOT_FOUND';
      throw error;
    }

    // Liberación de un trabajo ya asignado: ACEPTADA -> PENDIENTE sin técnico.
    if (solicitud.estado === 'ACEPTADA') {
      if (solicitud.tecnicoId !== user.id) {
        const error = new Error('Solo el técnico asignado puede liberar esta solicitud');
        error.status = 403;
        error.code = 'FORBIDDEN';
        throw error;
      }

      const updated = await tx.solicitudServicio.update({
        where: { id },
        data: {
          estado: 'PENDIENTE',
          tecnicoId: null,
          fechaAceptacion: null
        },
        select: selectSolicitud
      });

      await tx.historialEstadoSolicitud.create({
        data: {
          solicitudId: id,
          estadoAnterior: 'ACEPTADA',
          estadoNuevo: 'PENDIENTE',
          accion: 'LIBERACION',
          cambiadoPorId: user.id,
          motivo
        }
      });

      return updated;
    }

    if (solicitud.estado !== 'PENDIENTE') {
      const error = new Error(`No se puede rechazar una solicitud en estado ${solicitud.estado}`);
      error.status = 409;
      error.code = 'CONFLICT';
      throw error;
    }

    const yaRechazo = await tx.rechazoSolicitud.findUnique({
      where: {
        solicitudId_tecnicoId: {
          solicitudId: id,
          tecnicoId: user.id
        }
      }
    });

    if (yaRechazo) {
      const error = new Error('Ya has rechazado esta solicitud previamente');
      error.status = 409;
      error.code = 'CONFLICT';
      throw error;
    }

    await tx.rechazoSolicitud.create({
      data: {
        solicitudId: id,
        tecnicoId: user.id,
        motivo
      }
    });

    await tx.historialEstadoSolicitud.create({
      data: {
        solicitudId: id,
        estadoAnterior: 'PENDIENTE',
        estadoNuevo: 'PENDIENTE',
        accion: 'RECHAZO',
        cambiadoPorId: user.id,
        motivo
      }
    });

    return await tx.solicitudServicio.findUnique({
      where: { id },
      select: selectSolicitud
    });
  });
};

export const cambiarEstado = async ({ id, user, estadoEsperado, nuevoEstado, datosActualizar = {}, motivo = null, accion = 'cambiar el estado' }) => {
  return await prisma.$transaction(async (tx) => {
    const solicitud = await tx.solicitudServicio.findUnique({ where: { id } });
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

    const updated = await tx.solicitudServicio.update({
      where: { id },
      data: {
        estado: nuevoEstado,
        ...datosActualizar
      },
      select: selectSolicitud
    });

    await tx.historialEstadoSolicitud.create({
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

  let where = { solicitudId };
  if (user.rol === 'CLIENTE') {
    where = {
      ...where,
      OR: [
        { accion: null },
        { accion: { not: 'RECHAZO' } }
      ]
    };
  }

  const list = await prisma.historialEstadoSolicitud.findMany({
    where,
    orderBy: { fechaCambio: 'asc' },
    select: {
      id: true,
      solicitudId: true,
      estadoAnterior: true,
      estadoNuevo: true,
      accion: true,
      cambiadoPor: { select: { id: true, nombre: true, rol: true } },
      motivo: true,
      fechaCambio: true
    }
  });

  return list;
};
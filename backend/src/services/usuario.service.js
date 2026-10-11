import prisma from '../config/prisma.js';

const selectUsuario = {
  id: true,
  email: true,
  nombre: true,
  celular: true,
  rol: true,
  fechaCreacion: true
};

const soloDefinidos = (data) =>
  Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined));

const getUsuarioById = async (id) => {
  const usuario = await prisma.usuario.findUnique({
    where: { id },
    select: selectUsuario
  });

  if (!usuario) {
    const error = new Error('El usuario no existe');
    error.status = 404;
    error.code = 'NOT_FOUND';
    throw error;
  }

  return usuario;
};

export const updateProfile = async (id, data) => {
  await getUsuarioById(id);
  return await prisma.usuario.update({
    where: { id },
    data: soloDefinidos(data),
    select: selectUsuario
  });
};

export const listUsuarios = async (query = {}) => {
  const page = Number(query.page) || 1;
  const limit = Math.min(Number(query.limit) || 20, 100);
  const skip = (page - 1) * limit;

  const [data, total] = await Promise.all([
    prisma.usuario.findMany({
      skip,
      take: limit,
      orderBy: { fechaCreacion: 'desc' },
      select: selectUsuario
    }),
    prisma.usuario.count()
  ]);

  return { data, meta: { page, limit, total } };
};

export const getUserById = getUsuarioById;

export const updateUser = async (id, data) => {
  await getUsuarioById(id);
  return await prisma.usuario.update({
    where: { id },
    data: soloDefinidos(data),
    select: selectUsuario
  });
};
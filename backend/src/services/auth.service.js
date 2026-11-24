import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../config/prisma.js';
import { getJwtConfig } from '../config/env.js';

export const register = async (data) => {
  const existingUser = await prisma.usuario.findUnique({
    where: { email: data.email }
  });

  if (existingUser) {
    const error = new Error('Email ya registrado');
    error.status = 409;
    error.code = 'CONFLICT';
    throw error;
  }

  const passwordHash = await bcrypt.hash(data.password, 10);
  const nuevoUsuario = await prisma.usuario.create({
    data: {
      email: data.email,
      passwordHash,
      nombre: data.nombre,
      celular: data.celular || null,
      rol: data.rol || 'CLIENTE'
    },
    select: { id: true, email: true, nombre: true, celular: true, rol: true, fechaCreacion: true }
  });

  const jwtConfig = getJwtConfig();
  const token = jwt.sign(
    { id: nuevoUsuario.id, rol: nuevoUsuario.rol },
    jwtConfig.secret,
    { expiresIn: jwtConfig.expiresInSeconds }
  );

  return { usuario: nuevoUsuario, token };
};

export const login = async (email, password) => {
  const user = await prisma.usuario.findUnique({ where: { email } });
  if (!user) {
    const error = new Error('Credenciales inválidas');
    error.status = 401;
    error.code = 'UNAUTHORIZED';
    throw error;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    const error = new Error('Credenciales inválidas');
    error.status = 401;
    error.code = 'UNAUTHORIZED';
    throw error;
  }

  const { passwordHash, ...usuario } = await prisma.usuario.update({
    where: { id: user.id },
    data: { lastLogin: new Date() }
  });

  const jwtConfig = getJwtConfig();
  const token = jwt.sign(
    { id: usuario.id, rol: usuario.rol },
    jwtConfig.secret,
    { expiresIn: jwtConfig.expiresInSeconds }
  );

  return { usuario, token };
};

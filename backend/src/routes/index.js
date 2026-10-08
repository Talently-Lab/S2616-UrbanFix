import { Router } from 'express';
import authRoutes from './auth.routes.js';
import usuarioRoutes from './usuario.routes.js';
import adminRoutes from './admin.routes.js';
import categoriaRoutes from './categoria.routes.js';
import solicitudRoutes from './solicitud.routes.js';

const router = Router();

router.use('/auth', authRoutes);
router.use('/usuarios', usuarioRoutes);
router.use('/admin', adminRoutes);
router.use('/categorias', categoriaRoutes);
router.use('/solicitudes', solicitudRoutes);

export default router;

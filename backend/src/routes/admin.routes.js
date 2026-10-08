import { Router } from 'express';
import * as ctrl from '../controllers/admin.controller.js';
import { authenticate, authorize } from '../middlewares/auth.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import { listUsuariosQuerySchema, updateUsuarioAdminSchema } from '../schemas/admin.schema.js';

const router = Router();

router.use(authenticate, authorize(['ADMIN']));

router.get('/usuarios', validate(listUsuariosQuerySchema, 'query'), ctrl.list);
router.get('/usuarios/:id', ctrl.getById);
router.patch('/usuarios/:id', validate(updateUsuarioAdminSchema), ctrl.update);

export default router;
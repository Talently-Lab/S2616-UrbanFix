import { Router } from 'express';
import * as ctrl from '../controllers/solicitud.controller.js';
import { authenticate, authorize } from '../middlewares/auth.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import {
  createSolicitudSchema,
  updateSolicitudSchema,
  motivoSchema,
  listSolicitudesQuerySchema
} from '../schemas/solicitud.schema.js';

const router = Router();

router.use(authenticate);

router.post('/', authorize(['CLIENTE']), validate(createSolicitudSchema), ctrl.create);
router.get('/', validate(listSolicitudesQuerySchema, 'query'), ctrl.list);
router.get('/:id', ctrl.getById);
router.patch('/:id', authorize(['CLIENTE']), validate(updateSolicitudSchema), ctrl.update);
router.get('/:id/historial', ctrl.getHistorial);

// Cambios de estado
router.patch('/:id/aceptar', authorize(['TECNICO']), ctrl.aceptar);
router.patch('/:id/rechazar', authorize(['TECNICO']), validate(motivoSchema), ctrl.rechazar);
router.patch('/:id/iniciar', authorize(['TECNICO']), ctrl.iniciar);
router.patch('/:id/finalizar', authorize(['TECNICO']), ctrl.finalizar);
router.patch('/:id/cancelar', authorize(['CLIENTE', 'ADMIN']), validate(motivoSchema), ctrl.cancelar);

export default router;

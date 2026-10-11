import { Router } from 'express';
import * as ctrl from '../controllers/usuario.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import { updateMeSchema } from '../schemas/auth.schema.js';

const router = Router();

router.patch('/me', authenticate, validate(updateMeSchema), ctrl.updateMe);

export default router;

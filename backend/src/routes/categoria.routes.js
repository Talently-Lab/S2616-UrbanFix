import { Router } from 'express';
import * as ctrl from '../controllers/categoria.controller.js';

const router = Router();

router.get('/', ctrl.list);

export default router;

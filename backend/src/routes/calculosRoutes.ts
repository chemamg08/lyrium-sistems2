import { Router } from 'express';
import { getCalculosByClient, getCalculoById, createCalculo, deleteCalculo, calculateCalculo, getCountryConfig } from '../controllers/calculosController.js';

const router = Router();

router.get('/config', getCountryConfig);
router.post('/calculate', calculateCalculo);
router.get('/', getCalculosByClient);
router.get('/:id', getCalculoById);
router.post('/', createCalculo);
router.delete('/:id', deleteCalculo);

export default router;

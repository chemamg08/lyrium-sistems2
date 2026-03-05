import { Router } from 'express';
import { getContracts, createContract, getContractFile, deleteContract } from '../controllers/contractsController.js';
import { upload } from '../config/multer.js';

const router = Router();

router.get('/contracts', getContracts);
router.post('/contracts', upload.single('file'), createContract);
router.get('/contracts/:id/file', getContractFile);
router.delete('/contracts/:id', deleteContract);

export default router;

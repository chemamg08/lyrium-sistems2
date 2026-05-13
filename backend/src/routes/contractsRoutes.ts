import { Router } from 'express';
import { MulterError } from 'multer';
import { getContracts, createContract, getContractFile, deleteContract } from '../controllers/contractsController.js';
import { uploadBaseContract } from '../config/multerContracts.js';

const router = Router();

router.get('/contracts', getContracts);
router.post('/contracts', (req, res, next) => {
	uploadBaseContract.single('file')(req, res, (err: any) => {
		if (err instanceof MulterError && err.code === 'LIMIT_FILE_SIZE') {
			return res.status(413).json({ error: 'FILE_TOO_LARGE' });
		}
		if (err) {
			return res.status(400).json({ error: err.message || 'Solo se permiten archivos PDF' });
		}
		next();
	});
}, createContract);
router.get('/contracts/:id/file', getContractFile);
router.delete('/contracts/:id', deleteContract);

export default router;

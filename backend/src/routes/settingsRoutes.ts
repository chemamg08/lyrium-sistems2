import { Router } from 'express';
import multer from 'multer';
import { uploadLogo, hasLogo, deleteLogo, getSpecialties, updateSpecialties } from '../controllers/settingsController.js';

const router = Router();
const upload = multer({ dest: 'uploads/temp/' });

// POST /api/settings/logo - Subir logo
router.post('/logo', upload.single('logo'), uploadLogo);

// GET /api/settings/logo - Verificar si existe logo
router.get('/logo', hasLogo);

// DELETE /api/settings/logo - Eliminar logo
router.delete('/logo', deleteLogo);

// GET /api/settings/specialties?accountId=xxx - Obtener especialidades IA
router.get('/specialties', getSpecialties);

// PUT /api/settings/specialties - Guardar especialidades IA
router.put('/specialties', updateSpecialties);

export default router;

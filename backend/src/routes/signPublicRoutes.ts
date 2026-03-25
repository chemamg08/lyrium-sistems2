import { Router } from 'express';
import {
  getSigningInfo,
  getSigningPdf,
  submitSignatureHandler,
} from '../controllers/signatureController.js';

const router = Router();

// All routes here are PUBLIC (no auth required)
router.get('/:token', getSigningInfo);
router.get('/:token/pdf', getSigningPdf);
router.post('/:token/submit', submitSignatureHandler);

export default router;

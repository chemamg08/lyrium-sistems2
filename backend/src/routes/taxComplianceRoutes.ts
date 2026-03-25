import { Router } from 'express';
import {
  listObligations,
  createObligation,
  getObligation,
  patchObligation,
  removeObligation,
  downloadObligationDocument,
  getDeadlines,
  getSummary,
  listTaxModels,
  getTaxSyncHealthController,
} from '../controllers/taxComplianceController.js';

const router = Router();

router.get('/obligations', listObligations);
router.post('/obligations', createObligation);
router.get('/obligations/:id', getObligation);
router.patch('/obligations/:id', patchObligation);
router.delete('/obligations/:id', removeObligation);
router.get('/obligations/:id/document', downloadObligationDocument);

router.get('/deadlines', getDeadlines);
router.get('/summary', getSummary);
router.get('/sync-health', getTaxSyncHealthController);
router.get('/models/:country', listTaxModels);

export default router;

import { Router } from 'express';
import {
  getCases,
  getCaseById,
  assignCase,
  updateCaseStatus,
  linkCaseToClient,
  createManualCase,
  getCaseConversation,
  deleteCase,
  updateCaseNotes,
} from '../controllers/casesController.js';

const router = Router();

router.get('/', getCases);
router.post('/', createManualCase);
router.get('/:caseId', getCaseById);
router.post('/:caseId/assign', assignCase);
router.put('/:caseId/status', updateCaseStatus);
router.post('/:caseId/link-client', linkCaseToClient);
router.get('/:caseId/conversation', getCaseConversation);
router.delete('/:caseId', deleteCase);
router.patch('/:caseId/notes', updateCaseNotes);

export default router;

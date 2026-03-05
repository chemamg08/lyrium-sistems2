import { Router } from 'express';
import { uploadShared } from '../config/multerShared.js';
import {
  uploadAndShare,
  getShared,
  getReceived,
  deleteSharedFile,
  downloadSharedFile,
  getGroupMembers,
} from '../controllers/sharedFilesController.js';

const router = Router();

router.get('/group-members', getGroupMembers);
router.get('/shared', getShared);
router.get('/received', getReceived);
router.get('/download/:fileId', downloadSharedFile);
router.post('/upload', uploadShared.array('files', 20), uploadAndShare);
router.delete('/:fileId', deleteSharedFile);

export default router;

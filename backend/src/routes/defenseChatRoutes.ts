import { Router } from 'express';
import {
  getDefenseChat,
  getDefenseChats,
  createDefenseChat,
  deleteDefenseChatById,
  updateDefenseChatTitle,
  sendDefenseMessage,
  streamDefenseMessage,
  exportDefenseChat,
  downloadDefensePDF,
  importDefenseChat,
  clearDefenseChat,
  getSavedStrategies,
  deleteStrategy,
  uploadPdfToChat,
  getEvidence,
  createEvidence,
  updateEvidence,
  deleteEvidence,
  simulateCounterReplica,
  saveCounterReplica,
  uploadEvidence,
  getEvidenceLibrary,
  getEvidenceTrash,
  trashEvidence,
  restoreEvidence,
  permanentDeleteEvidence,
  getEvidenceQuota,
} from '../controllers/defenseChatController.js';
import { uploadDefenseEvidence } from '../config/multerDefense.js';

const router = Router();

// Rutas para gestión de múltiples chats
router.get('/chats', getDefenseChats);
router.post('/chats', createDefenseChat);
router.delete('/chats/:chatId', deleteDefenseChatById);
router.put('/chats/:chatId', updateDefenseChatTitle);

// Rutas de chat individual
router.get('/', getDefenseChat);
router.post('/message', sendDefenseMessage);
router.post('/message/stream', streamDefenseMessage);
router.get('/strategies', getSavedStrategies);
router.delete('/strategies/:id', deleteStrategy);
router.post('/export', exportDefenseChat);
router.post('/download-pdf', downloadDefensePDF);
router.post('/import', importDefenseChat);
router.post('/upload-pdf', uploadDefenseEvidence.single('pdf'), uploadPdfToChat);
router.delete('/', clearDefenseChat);

// Evidence routes
router.get('/:chatId/evidence', getEvidence);
router.post('/:chatId/evidence', createEvidence);
router.put('/evidence/:evidenceId', updateEvidence);
router.delete('/evidence/:evidenceId', deleteEvidence);

// New evidence library routes
router.post('/:chatId/evidence/upload', uploadDefenseEvidence.single('file'), uploadEvidence);
router.get('/evidence/library', getEvidenceLibrary);
router.get('/evidence/trash', getEvidenceTrash);
router.post('/evidence/:evidenceId/trash', trashEvidence);
router.post('/evidence/:evidenceId/restore', restoreEvidence);
router.delete('/evidence/:evidenceId/permanent', permanentDeleteEvidence);
router.get('/evidence/quota', getEvidenceQuota);

// Counter-replica simulation
router.post('/:chatId/simulate-counter-replica', simulateCounterReplica);
router.post('/:chatId/save-counter-replica', saveCounterReplica);

export default router;

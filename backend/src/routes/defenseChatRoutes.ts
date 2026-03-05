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
  uploadPdfToChat
} from '../controllers/defenseChatController.js';
import { upload } from '../config/multer.js';

const router = Router();

// Rutas para gestión de múltiples chats
router.get('/chats', getDefenseChats);          // Listar todos los chats
router.post('/chats', createDefenseChat);       // Crear nuevo chat
router.delete('/chats/:chatId', deleteDefenseChatById);  // Eliminar chat específico
router.put('/chats/:chatId', updateDefenseChatTitle);    // Actualizar título de chat

// Rutas de chat individual
router.get('/', getDefenseChat);
router.post('/message', sendDefenseMessage);
router.post('/message/stream', streamDefenseMessage);
router.get('/strategies', getSavedStrategies);
router.delete('/strategies/:id', deleteStrategy);
router.post('/export', exportDefenseChat);
router.post('/download-pdf', downloadDefensePDF);
router.post('/import', importDefenseChat);
router.post('/upload-pdf', upload.single('pdf'), uploadPdfToChat);
router.delete('/', clearDefenseChat);

export default router;

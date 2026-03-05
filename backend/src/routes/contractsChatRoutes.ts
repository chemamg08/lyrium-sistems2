import { Router } from 'express';
import {
  createContractChat,
  getContractChat,
  getAllContractChats,
  getChatsByContract,
  updateChatTitle,
  duplicateContractChat,
  sendContractMessage,
  streamContractMessage,
  downloadGeneratedContract,
  deleteContractChat,
  deleteEmptyContractChats,
  createTemporaryChat,
  uploadTemporaryContract
} from '../controllers/contractsChatController.js';
import { uploadTempContract } from '../config/multerContracts.js';

const router = Router();

// POST /api/contracts/chat/create - Crear nuevo chat basado en contrato
router.post('/create', createContractChat);

// POST /api/contracts/chat/create-temporary - Crear chat temporal sin contrato base  
router.post('/create-temporary', createTemporaryChat);

// POST /api/contracts/chat/:chatId/upload-temporary - Subir PDF temporal
router.post('/:chatId/upload-temporary', uploadTempContract.single('file'), uploadTemporaryContract);

// GET /api/contracts/chat - Obtener todos los chats de contratos
router.get('/', getAllContractChats);

// GET /api/contracts/chat/by-contract/:contractBaseId - Obtener chats de un contrato específico
router.get('/by-contract/:contractBaseId', getChatsByContract);

// POST /api/contracts/chat/message - Enviar mensaje en chat de contrato
router.post('/message', sendContractMessage);
router.post('/message/stream', streamContractMessage);

// PUT /api/contracts/chat/:chatId/title - Actualizar título del chat
router.put('/:chatId/title', updateChatTitle);

// POST /api/contracts/chat/:chatId/duplicate - Duplicar chat
router.post('/:chatId/duplicate', duplicateContractChat);

// DELETE /api/contracts/chat/empty/:contractBaseId - Eliminar chats vacíos
router.delete('/empty/:contractBaseId', deleteEmptyContractChats);

// GET /api/contracts/chat/:chatId - Obtener chat específico
router.get('/:chatId', getContractChat);

// DELETE /api/contracts/chat/:chatId - Eliminar chat
router.delete('/:chatId', deleteContractChat);

// GET /api/contracts/generated/:id/download - Descargar contrato generado
router.get('/generated/:id/download', downloadGeneratedContract);

export default router;

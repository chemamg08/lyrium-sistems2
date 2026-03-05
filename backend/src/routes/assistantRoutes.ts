import { Router } from 'express';
import { 
  clearAssistantChat, 
  createAssistantChat, 
  deleteAssistantChat, 
  getAssistantChat, 
  getAssistantChats,
  sendAssistantMessage,
  streamAssistantMessage,
  uploadAssistantFile
} from '../controllers/assistantController.js';
import { uploadAssistantFileMw } from '../config/multerAssistant.js';

const router = Router();

router.get('/chats', getAssistantChats);
router.post('/chats', createAssistantChat);
router.delete('/chats/:chatId', deleteAssistantChat);

router.get('/chat', getAssistantChat);
router.post('/chat/message', sendAssistantMessage);
router.post('/chat/message/stream', streamAssistantMessage);
router.delete('/chat/:accountId', clearAssistantChat);

// Subir archivo para contexto (PDF o TXT)
router.post('/upload-file', uploadAssistantFileMw.single('file'), uploadAssistantFile);

export default router;

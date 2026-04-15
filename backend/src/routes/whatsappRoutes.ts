import { Router } from 'express';
import {
  connectWhatsApp,
  connectWhatsAppWithCode,
  connectWhatsAppWithToken,
  connectWhatsAppManual,
  getWhatsAppStatus,
  disconnectWhatsApp,
  updateWhatsAppSwitch,
  updateWhatsAppSelection,
  getWhatsAppConversations,
  markWhatsAppRead,
  toggleWhatsAppAutoReply,
  deleteWhatsAppConversation,
  sendWhatsAppMessage,
  createWhatsAppFolder,
  deleteWhatsAppFolder,
  assignConversationToWAFolder,
  removeConversationFromWAFolder,
  getWhatsAppUnreadCount,
  createWhatsappCorreoConsulta,
  deleteWhatsappCorreoConsulta,
  getWhatsAppClassifyRules,
  createWhatsAppClassifyRule,
  deleteWhatsAppClassifyRule,
  serveWAAttachment,
  waAttachmentMiddleware,
} from '../controllers/whatsappController.js';

const router = Router();

// Instance management
router.post('/connect', connectWhatsApp);
router.post('/meta/connect', connectWhatsAppWithCode);
router.post('/meta/connect-token', connectWhatsAppWithToken);
router.post('/meta/connect-manual', connectWhatsAppManual);
router.get('/status', getWhatsAppStatus);
router.post('/disconnect', disconnectWhatsApp);

// Auto-reply switch
router.put('/switch', updateWhatsAppSwitch);
router.put('/selection', updateWhatsAppSelection);

// Conversations
router.get('/conversations', getWhatsAppConversations);
router.put('/mark-read', markWhatsAppRead);
router.put('/conversations/:id/auto-reply', toggleWhatsAppAutoReply);
router.delete('/conversations/:id', deleteWhatsAppConversation);
router.post('/conversations/:id/send', waAttachmentMiddleware.array('files', 10), sendWhatsAppMessage);

// Folders
router.get('/unread-count', getWhatsAppUnreadCount);
router.post('/folders', createWhatsAppFolder);
router.delete('/folders/:id', deleteWhatsAppFolder);
router.put('/folders/assign', assignConversationToWAFolder);
router.put('/folders/remove', removeConversationFromWAFolder);

// Correos de consulta (WhatsApp, separados de Email)
router.post('/correos-consultas', createWhatsappCorreoConsulta);
router.delete('/correos-consultas', deleteWhatsappCorreoConsulta);

// WhatsApp classify rules
router.get('/classify-rules', getWhatsAppClassifyRules);
router.post('/classify-rules', createWhatsAppClassifyRule);
router.delete('/classify-rules/:id', deleteWhatsAppClassifyRule);

// Serve WA attachment files
router.get('/wa-attachments/:filename', serveWAAttachment);

export default router;
